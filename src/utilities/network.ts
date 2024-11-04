import axios from "axios";
import {
  checkDataToTn,
  checkDataToTwl,
  convertJsonToUSFM,
  fetchFileFromRepo,
  flattenGroupData,
  getBibleBookFolders,
  getMetaData,
  getRepoFileName,
} from "./resourceUtils";
// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import { getAllFiles, getChecksum, getFilesOfType, getPatch, readJsonFile } from "./fileUtils";
import { GeneralObject, NestedObject, ResourcesObject } from "../../types";

export const mergeToMasterBranch = 'merge_changes_to_master'
export const mergeFromMasterBranch = 'update_from_master'

interface TreeItem {
  path: string;
  type: string;
  sha: string;
  url: string;
}

interface RepoResponseItem {
  tree: undefined|TreeItem[];
  page: undefined|number;
  total_count: undefined|number;
  sha: undefined|string;
  url: undefined|string;
  truncated: undefined|boolean;
  error: undefined|string
}

export async function getRepoTree(server: string, owner: string, repo: string, sha: string, token: string = ''): Promise<RepoResponseItem> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/git/trees/${sha}?recursive=true`;
  try {
    const headers = token ? 
    {
      "Authorization": `token ${token}`,
    } : {};
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const errorMsg = `Error: ${error.message}`
    console.error(errorMsg);
    // @ts-ignore
    return { error: errorMsg};
  }
}

interface Owner {
  id: number;
  login: string;
  full_name: string;
  email: string;
  avatar_url: string;
  language: string;
  is_admin: boolean;
  last_login: string;
  created: string;
  restricted: boolean;
  active: boolean;
  prohibit_login: boolean;
  location: string;
  website: string;
  description: string;
  visibility: string;
}

interface GetOwnersType {
  owners?: Owner[];
  error?: string;
}

export async function getOwners(server: string, token: string = ''): Promise<GetOwnersType> {
  const url = `${server}/api/v1/catalog/list/owners`;
  const headers = token ?
  {
    Authorization: `token ${token}`,
  }
  : {};

  try {
    const response = await axios.get(url, { headers });
    const owners = response.data.data as Owner[];
    return { owners };
  } catch (error) {
    // @ts-ignore
    const errorMsg = `Error: ${error.message}`
    console.error(errorMsg);
    // @ts-ignore
    return { error: errorMsg};
  }
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  fork: boolean;
  url: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  language: string;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  default_branch: string;
  open_issues_count: number;
  topics: string[];
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: string;
  pushed_at: string;
  created_at: string;
  updated_at: string;
}

interface GetReposType {
  repos?: Repository[];
  error?: string;
}

export async function getReposForOwner(server: string, owner:string, token: string = ''): Promise<GetReposType> {
  const url = `${server}/api/v1/repos/search?owner=${owner}`
  const headers = token ?
    {
      Authorization: `token ${token}`,
    }
    : {};

  try {
    const response = await axios.get(url, { headers });
    const repos = response.data.data as Repository[];
    return { repos };
  } catch (error) {
    // @ts-ignore
    const errorMsg = `Error: ${error.message}`
    console.error(errorMsg);
    // @ts-ignore
    return { error: errorMsg};
  }
}

const checkingRegex = /_checking$/;

export async function getCheckingReposForOwner(server: string, owner:string, token: string = '') {
  const results = await getReposForOwner(server, owner);

  const checkingRepos = results?.repos?.filter(repo => checkingRegex.test(repo.name)) || []
  results.repos = checkingRepos
  return results;
}

export async function checkIfRepoExists(server: string, owner: string, repo: string, token: string): Promise<boolean> {
  const url = `${server}/api/v1/repos/${owner}/${repo}`;

  try {
    await axios.get(url, {
      headers: {
        'Authorization': `token ${token}`
      }
    });
    return true; // Repository exists
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status = error?.response?.status;
    if (status === 404) {
      return false; // Repository does not exist
    } else {
      // @ts-ignore
      console.error(`Error: ${error.message}`);
      throw error;
    }
  }
}

interface CreateRepoResponse {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  status: number;
  error: undefined|string
  // Add other fields as needed
}

export async function createCheckingRepository(server: string, owner: string, repoName: string, token: string): Promise<CreateRepoResponse> {
  const url = `${server}/api/v1/user/repos`;
  const data = {
    name: repoName,
    description: "Translation Checking Repo",
    auto_init: true,
    private: false,
    license: "MIT",
    default_branch: "master"
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

export function getRepoName(targetLanguageId:string, targetBibleId:string, glLanguageId:string, bookId: string = '') {
  let repoName = getRepoFileName(targetLanguageId, targetBibleId, glLanguageId, bookId);
  repoName += '_checking'
  return repoName
}

export function getTimeStamp() {
// TRICKY: macOS does not support `:` in file names, so convert them and the macOS `/` to `-`.
  const timestamp = (new Date()).toISOString().replace(/[:/]/g, "_");
  return timestamp
}

export function getNewBranchName(targetLanguageId:string, targetBibleId:string, glLanguageId:string, bookId: string = '') {
  const branchName = `update_${getTimeStamp()}`;
  return branchName
}

interface CreateBranchResponse {
  name: string;
  url: string;
  status: number;
  error: undefined|string;
  // Add other fields as needed
}

export async function createRepoBranch(server: string, owner: string, repo: string, newBranch: string, token: string, sourceBranch = 'master'): Promise<CreateBranchResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/branches`;
  // const url = `${server}/api/v1/repos/${owner}/${repo}/git/refs`;
  const data = {
    new_branch_name: newBranch,
    old_ref_name: sourceBranch,
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

interface CommitCheckResult {
  containsCommit: boolean;
  commitSha: string;
  message: string;
}

async function checkCommitInBranch(
  server: string,
  repoOwner: string,
  repoName: string,
  branch: string,
  commitSha: string,
  token: string
): Promise<CommitCheckResult> {
  try {
  const results = await getCommitsInBranch(server, repoOwner, repoName, branch, token);
  const commits = results?.commits;
  const containsCommit = commits?.some((commit: any) => commit.sha === commitSha);

    return {
      containsCommit,
      commitSha,
      message: containsCommit ? 'Commit is in the master branch.' : 'Commit is not in the master branch.'
    };
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      // @ts-ignore
      error: message,
      status: status
    }
  }
}

interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  status?: number;
  error?: string;
}

interface getCommitsInBranchResponse {
  commits: Commit[]
  status?: number;
  error?: string;
}

async function getCommitsInBranch(
  server: string,
  repoOwner: string,
  repoName: string,
  branchName: string,
  token: string
): Promise<getCommitsInBranchResponse> {
  const apiUrl = `${server}/api/v1/repos/${repoOwner}/${repoName}/commits?sha=${branchName}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `token ${token}`
      }
    });

    const commits = response.data.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.date
      },
      committer: {
        name: commit.commit.committer.name,
        email: commit.commit.committer.email,
        date: commit.commit.committer.date
      }
    }));
    return { commits };
  } catch (error) {
    // @ts-ignore
    console.error('Error:', error.message);
    throw error
  }
}

interface UploadFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    // Add other fields as needed
  };
  commit: {
    sha: string;
    url: string;
    html_url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
      html_url: string;
    }>;
  };
  status?: number;
  error?: string;
}

export async function uploadRepoFile(server: string, owner: string, repo: string, branch: string, filePath: string, content: Buffer, token: string): Promise<UploadFileResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}`;
  const data = {
    content: Buffer.from(content).toString('base64'),
    message: `Create ${filePath}`,
    branch: branch
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

export async function uploadRepoFileFromPath(server: string, owner: string, repo: string, branch: string, uploadPath: string, sourceFilePath: string, token: string): Promise<UploadFileResponse> {
  const content = fs.readFileSync(sourceFilePath, "UTF-8")?.toString()
  const results = await uploadRepoFile(server, owner, repo, branch, uploadPath, content, token)
  return results
}

interface ModifyFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    // Add other fields as needed
  };
  commit: {
    sha: string;
    url: string;
    html_url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
      html_url: string;
    }>;
  };
  status?: number;
  error?: string;
}

export async function modifyRepoFile(server: string, owner: string, repo: string, branch: string, filePath: string, content: Buffer, token: string, sha: string): Promise<UploadFileResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}`;
  const data = {
    content: Buffer.from(content).toString('base64'),
    message: `Update ${filePath}`,
    branch: branch,
    sha: sha
  };

  try {
    const response = await axios.put(url, data, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

async function uploadRepoDiffPatchFile(
  server: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  patch: string,
  sha: string,
  token: string
): Promise<Commit> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/diffpatch`;
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
  };

  const encodedPatch = Buffer.from(patch).toString('base64');

  const data = {
    branch: branch,
    content: encodedPatch,
    from_path: '.',
    message: 'Applying diffpatch',
    sha,
    signoff: true
  };

  try {
    const response = await axios.post(url, data, { headers });
    return response.data as Commit;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

export async function modifyRepoFileFromPath(server: string, owner: string, repo: string, branch: string, uploadPath: string, sourceFilePath: string, token: string, sha: string, downloadAndDiff = false): Promise<ModifyFileResponse> {
  let results:UploadFileResponse
  
  if (!downloadAndDiff) {
    const content = fs.readFileSync(sourceFilePath, "UTF-8")?.toString()
    results = await modifyRepoFile(server, owner, repo, branch, uploadPath, content, token, sha);
  } else {
    const fileData = await getFileFromBranch(server, owner, repo, branch, uploadPath, token);
    if (fileData?.error) {
      // @ts-ignore
      return fileData;
    }
    const dcsContent = fileData?.content
    const content = fs.readFileSync(sourceFilePath, "UTF-8")?.toString()
    if (dcsContent === content) { // if no change
      // nothing to do
      return {
        // @ts-ignore
        success: true,
        content,
      }
    } else
    if (dcsContent) {
      const diffPatch = getPatch(uploadPath, dcsContent, content, false, 4)
      // @ts-ignore
      results = await uploadRepoDiffPatchFile(server, owner, repo, branch, uploadPath, diffPatch, fileData.sha, token)
      results.content = content
    } else {
      const content = fs.readFileSync(sourceFilePath, "UTF-8")?.toString()
      results = await modifyRepoFile(server, owner, repo, branch, uploadPath, content, token, sha);
    }
  }

  // @ts-ignore
  return results
}

interface DeleteFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    // Add other fields as needed
  };
  commit: {
    sha: string;
    url: string;
    html_url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
      html_url: string;
    }>;
  };
  status?: number;
  error?: undefined|string;
}

export async function deleteRepoFile(server: string, owner: string, repo: string, branch: string, filePath: string, token: string, sha: string): Promise<DeleteFileResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}`;
  const data = {
    message: `Delete ${filePath}`,
    branch: branch,
    sha: sha
  };

  try {
    const response = await axios.delete(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      data
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

export async function checkBranchExists(server: string, owner: string, repo: string, branch: string, token: string): Promise<boolean> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/branches/${branch}`;

  try {
    await axios.get(url, {
      headers: {
        'Authorization': `token ${token}`
      }
    });
    return true; // Branch exists
  } catch (error) {
    // @ts-ignore
    if (error.response && error.response.status === 404) {
      return false; // Branch does not exist
    } else {
      // @ts-ignore
      console.error(`Error: ${error.message}`);
      throw error;
    }
  }
}

interface Branch {
  name: string;
  commit: {
    id: string;
    message: string;
    url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    // Add other fields as needed
  };
  // Add other fields as needed
}

interface GetBranchesResult {
  branches: Branch[];
  status?: number;
  error?: undefined|string;
}

async function getRepoBranches(
  server: string,
  repoOwner: string,
  repoName: string,
  accessToken: string
): Promise<GetBranchesResult> {
  try {
    const response = await axios.get(
      `${server}/api/v1/repos/${repoOwner}/${repoName}/branches`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return { 
      branches: response.data as Branch[] };
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

function getManualPullRequest(server: string, owner: string, repo: string, prNumber: number): string {
  const url = `${server}/${owner}/${repo}/pulls/${prNumber}`;
  return url
}

export async function createPullRequest(server: string, owner: string, repo: string, branchToMergeFrom: string, branchToMergeInto: string, title: string, body: string, token: string): Promise<PullRequest> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/pulls`;
  const data = {
    head: branchToMergeFrom,
    base: branchToMergeInto,
    title: title,
    body: body
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  // Add other fields as needed
}

export async function getChangedFiles(
  server: string,
  repoOwner: string,
  repoName: string,
  pullRequestId: number,
  accessToken: string
): Promise<ChangedFile[]> {
  try {
    const url = `${server}/api/v1/repos/${repoOwner}/${repoName}/pulls/${pullRequestId}/files`;
    const response = await axios.get(
      url,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    // console.log(response)
    return response.data as ChangedFile[];
  } catch (error) {
    // @ts-ignore
    console.error('Error getting changed files:', error);
    throw error;
  }
}

interface FileData {
  content: string;
  encoding: string;
  url: string;
  sha: string;
  size: number;
  error?: string;
  status?: number;
}

async function getFileFromBranch(
  server: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token: string
): Promise<FileData> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const headers = {
    Authorization: `token ${token}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const fileData = response.data as FileData;
    if (response?.data?.encoding === 'base64') {
      const decodedContent = Buffer.from(fileData.content, "base64").toString("utf-8");
      // @ts-ignore
      fileData.content = decodedContent
    }
    return fileData;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      // @ts-ignore
      error: message,
      status: status
    }
  }
}

interface MergePullRequestResponse {
  message: string;
  url: string;
  error?: string
  status?: number
  // Add other fields as needed
}

export async function squashMergePullRequest(server: string, owner: string, repo: string, pullNumber: number, autoDelete: boolean, token: string, retryCount = 0): Promise<MergePullRequestResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const data = {
    Do: "squash",
    MergeMessageField: `Squash merge pull request #${pullNumber}`,
    delete_branch_after_merge: autoDelete,
  };
  
  let message:string = ''
  let status:number = 0

  for (let i = 0; i < retryCount + 1; i++) {
    try {
      const response = await axios.post(url, data, {
        headers: {
          "Authorization": `token ${token}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      // @ts-ignore
      message = `Error: ${error.message}`;
      // @ts-ignore
      status = error.status;
      
      if ((status === 405) && (i < retryCount)) {
        console.warn(`squashMergePullRequest(), got error ${status}, retry ${i+1}`)
        continue
      } else {
        break
      }
    }
  }

  // @ts-ignore
  return {
    error: message,
    status: status
  }
}

interface CommitInfo {
  "label": string;
  "ref": string;
  "repo": {};
  "repo_id": number;
  "sha": string
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  head: CommitInfo;
  base: CommitInfo;
  created_at: string;
  updated_at: string;
  mergeable: boolean,
  merged: boolean,
  url: string;
  error?: string;
  status?: number;
  // Add other fields as needed
}

interface UpdatePullRequestData {
  title?: string;
  body?: string;
  state?: string;
  // Add other fields as needed
}

export async function updatePullRequest(
  server: string,
  repoOwner: string,
  repoName: string,
  pullRequestId: number,
  accessToken: string,
  updateData: UpdatePullRequestData
): Promise<PullRequest> {
  try {
    const url = `${server}/api/v1/repos/${repoOwner}/${repoName}/pulls/${pullRequestId}`;
    const response = await axios.patch(
      url,
      updateData,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return response.data as PullRequest;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

interface OpenPullRequestData {
  pullRequests: PullRequest[];
  status?: number;
  error?: undefined|string;
  matchedPullRequest?: PullRequest;
  // Add other fields as needed
}

async function getOpenPullRequests(
  server: string,
  repoOwner: string,
  repoName: string,
  accessToken: string
): Promise<OpenPullRequestData> {
  try {
    const response = await axios.get(
      `${server}/api/v1/repos/${repoOwner}/${repoName}/pulls?state=open`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return {
      pullRequests: response.data as PullRequest[]
    };
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      error: message,
      status: status
    }
  }
}

export async function deleteBranch(
  server: string,
  repoOwner: string,
  repoName: string,
  branchName: string,
  accessToken: string
): Promise<boolean> {
  try {
    const url = `${server}/api/v1/repos/${repoOwner}/${repoName}/branches/${branchName}`;
    const response = await axios.delete(
      url,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return true
  } catch (error) {
    console.error('Error deleting branch:', error);
  }
  return false
}

interface Branch {
  name: string;
  commit: {
    id: string;
    message: string;
    url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    // Add other fields as needed
  };
  // Add other fields as needed
}

async function getRepoBranch(
  server: string,
  repoOwner: string,
  repoName: string,
  branchName: string,
  accessToken: string
): Promise<Branch> {
  try {
    const url = `${server}/api/v1/repos/${repoOwner}/${repoName}/branches/${branchName}`;
    const response = await axios.get(
      url,
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return response.data as Branch;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      // @ts-ignore
      error: message,
      status: status
    }
  }
}

interface TagData {
  id: number;
  name: string;
  message: string;
  target: string;
  sha: string;
  url: string;
}

async function createTag(
  server: string,
  owner: string,
  repo: string,
  tagName: string,
  tagMessage: string,
  target: string,
  token: string
): Promise<TagData> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/tags`;
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
  };

  const data = {
    tag: tagName,
    message: tagMessage,
    target: target,
  };

  try {
    const response = await axios.post(url, data, { headers });
    return response.data as TagData;
  } catch (error) {
    // @ts-ignore
    const message = `Error: ${error.message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    return {
      // @ts-ignore
      error: message,
      status: status
    }
  }
}

type DcsUploadStatus = {
  files?: NestedObject;
  commit?: ResourcesObject,
  lastState?: ResourcesObject,
}

const dcsStatusFile = '.dcs_upload_status'

async function deleteTheBranchAndPR(server: string, owner: string, repo: string, pr: PullRequest, token: string, branch: string) {
  const updateData = {
    state: 'closed'
  };
  console.log(`updateFilesInBranch - closing PR #${pr.number}`)
  const results = await updatePullRequest(server, owner, repo, pr.number, token, updateData);
  if (results.error) {
    console.error(`updateFilesInBranch - PR closing failed`);
  } else {
    console.log(`updateFilesInBranch - deleting branch`);
    const success = await deleteBranch(server, owner, repo, branch, token);
    if (!success) {
      console.error(`updateFilesInBranch - branch  ${branch} deletion failed`);
    } else {
      return true;
    }
  }
  return false
}

async function updateFilesInBranch(localFiles: string[], localRepoPath: string, handledFiles: NestedObject, uploadedFiles: NestedObject, server: string, owner: string, repo: string, branch: string, token: string): Promise<GeneralObject> {
  let changedFiles = 0;
  for (const localFile of localFiles) {
    if ((localFile.includes(dcsStatusFile)) || (localFile === ".DS_Store")) { // skip over DCS data file, and system files
      continue;
    }

    const fullFilePath = path.join(localRepoPath, localFile);
    let doUpload = false;
    let skip = false;
    let localChecksum: string = "";

    const remoteFileData = handledFiles[localFile];
    const isOnDcs = !!remoteFileData;
    if (!isOnDcs) {
      doUpload = true;
    } else {
      localChecksum = await getChecksum(fullFilePath);
      const lastUploadData = uploadedFiles[localFile];
      const lastSha = lastUploadData?.sha;
      if ((lastUploadData?.checksum === localChecksum) && (remoteFileData?.sha === lastSha)) {
        // if checksum unchanged and sha unchanged, then skip this file
        skip = true;
      }
    }

    let results = null;
    if (!skip) {
      if (doUpload) { // uploading changed file
        console.log(`updateFilesInBranch - uploading file ${localFile}`);
        results = await uploadRepoFileFromPath(server, owner, repo, branch, localFile, fullFilePath, token);
      } else {
        console.log(`updateFilesInBranch - updating changed file ${localFile}`);
        const sha = remoteFileData?.sha || "";
        results = await modifyRepoFileFromPath(server, owner, repo, branch, localFile, fullFilePath, token, sha, false);
      }

      changedFiles++

      if (!results?.error) {
        // @ts-ignore
        const fileData = results.content;
        const checksum = await getChecksum(fullFilePath);
        const newFileData = {
          ...fileData,
          checksum,
        };
        // @ts-ignore
        delete newFileData["content"];
        uploadedFiles[localFile] = newFileData;
        if (isOnDcs) {
          delete handledFiles[localFile];
          changedFiles++
        }
      } else {
        // @ts-ignore
        results.errorUploading = true
        console.error(results.error);
        return results
      }
    } else {
      delete handledFiles[localFile];
    }
  }

  for (const file of Object.keys(handledFiles)) {
    const fileData = handledFiles[file];
    const fileType = fileData?.type;
    if (fileType === "file" || fileType === "blob") {
      console.log(`updateFilesInBranch - deleting ${file}`);

      const sha = fileData?.sha || "";
      const results = await deleteRepoFile(server, owner, repo, branch, file, token, sha);

      if (results?.error) {
        console.log(results);
      }
    }
  }
  console.log(`updateFilesInBranch - files changed count ${changedFiles}`);
  return { changedFiles }
}

export async function downloadPublicRepoFromBranch(localRepoPath: string, server: string, owner: string, repo: string, branch: string): Promise<GeneralObject> {
  fs.ensureDirSync(localRepoPath)
  const treeResults = await getRepoTree(server, owner, repo, 'master');
  if (treeResults.error) {
    return treeResults
  }

  const dcsFiles: NestedObject = {};

  for (const file of treeResults?.tree || []) { // make object indexed by path
    // @ts-ignore
    dcsFiles[file.path] = file;
  }

  const commit = treeResults.sha || '';
  const results = await downloadFilesInBranch(localRepoPath, dcsFiles, server, owner, repo, branch)
  
  const newStatus = {
    files: dcsFiles,
    commit,
    lastState: { 
      downloaded: true
    },
  };
  fs.outputJsonSync(path.join(localRepoPath, dcsStatusFile, owner), newStatus);
  return results
}

async function downloadFilesInBranch(localRepoPath: string, dcsFiles: NestedObject, server: string, owner: string, repo: string, branch: string): Promise<GeneralObject> {
  let changedFiles = 0;
  const files = Object.keys(dcsFiles)
  for (const fileName of files) {
    if ((fileName.includes(dcsStatusFile)) || (fileName === ".DS_Store")) { // skip over DCS data file, and system files
      continue;
    }
    const fullFilePath = path.join(localRepoPath, fileName);

    const dcsFileData = dcsFiles[fileName];
    let localChecksum: string = "";

    let results = null;
    const fileType = dcsFileData?.type;

    if (fileType === "file" || fileType === "blob") {
      console.log(`downloadFilesInBranch - downloading file ${fileName}`);
      const results = await fetchFileFromRepo(server, owner, repo, branch, localRepoPath, fileName);

      // using API - probably slowing using base46 encoding
      // results = await getFileFromBranch(server, owner, repo, branch, fileName, token);

      changedFiles++

      if (!results?.error) {
        localChecksum = await getChecksum(fullFilePath);
        dcsFileData.checksum = localChecksum
        // @ts-ignore
        delete dcsFileData["content"];
      } else {
        // @ts-ignore
        results.errorDownloading = true
        console.error(results.error);
        return results
      }
    }
  }

  console.log(`downloadFilesInBranch - files downloaded count ${changedFiles}`);
  return { changedFiles }
}

async function makeSureBranchExists(server: string, owner: string, repo: string, token: string, branch: string, branchAlreadyExists = false, previousCommit: string = ''): Promise<GeneralObject> {
  let newRepo = false;
  let newBranch = false;
  let repoExists = false;
  
  if (branchAlreadyExists) { // if we know branch already exists, no need to check repo
    repoExists = true
  } else {
    repoExists = await checkIfRepoExists(server, owner, repo, token);
  }

  if (!repoExists) {
    console.log(`updateFilesInBranch - creating repo ${owner}/${repo}`);
    const results = await createCheckingRepository(server, owner, repo, token);
    if (results?.error) {
      console.error(`updateFilesInBranch - error creating repo`);
      return {
        error: results?.error,
        errorCreatingRepo: true,
        newRepo,
      }
    }
    newRepo = true;
  }

  const branchExists = await checkBranchExists(server, owner, repo, branch, token);
  if (!branchExists) {
    let head = 'master'
    if (previousCommit && !newRepo) {
      const result = await checkCommitInBranch(server, owner, repo, 'master', previousCommit, token);
      if (result?.containsCommit) {
        head = previousCommit
      }
    }
    
    console.log(`updateFilesInBranch - creating repo branch from ${head}`);
    const results = await createRepoBranch(server, owner, repo, branch, token, head);
    if (results?.error) {
      console.error(`updateFilesInBranch - error creating branch ${branch}`);
      return {
        error: results?.error,
        errorCreatingBranch: true,
        newRepo,
      }
    } else {
      newBranch = true
    }
  }
  return { newRepo, newBranch };
}

async function getMergeToMasterPR(server: string, owner: string, repo: string, token: string, state: GeneralObject) {
  const prResults = await getOpenPullRequests(server, owner, repo, token);
  if (!prResults.error) {
    console.log(`updateFilesInBranch - found ${prResults?.pullRequests?.length} PRs`);

    const pullRequest = prResults?.pullRequests.find(pr => {
      const baseBranch = pr?.base?.ref;
      const headBranch = pr?.head?.ref;
      const match = (baseBranch === "master") && (headBranch === mergeToMasterBranch);
      return match;
    });
    if (pullRequest) {
      prResults.matchedPullRequest = pullRequest;
      state.prNumber = pullRequest.number;
      state.prURL = getManualPullRequest(server, owner, repo, pullRequest.number);
    }
  }
  return prResults;
}

async function updateFilesAndMergeToMaster(localRepoPath: string, server: string, owner: string, repo: string, token: string, dcsState: DcsUploadStatus, state: GeneralObject, updateSavedData: boolean) {
  const branch = mergeToMasterBranch;

  const localFiles = getAllFiles(localRepoPath);
  const results = await getRepoTree(server, owner, repo, branch, token);
  const handledFiles: NestedObject = {};
  let uploadedFiles: NestedObject = dcsState?.files || {};
  if (state.newRepo) { // if new repo then upload everything
    uploadedFiles = {};
  }

  for (const file of results?.tree || []) { // make object indexed by path
    // @ts-ignore
    handledFiles[file.path] = file;
  }
  
  const updateFilesResults  = await updateFilesInBranch(localFiles, localRepoPath, handledFiles, uploadedFiles, server, owner, repo, branch, token);
  if (updateFilesResults.error) {
    return updateFilesResults
  }

  state.filesChangedOnBranchCount = updateFilesResults.changedFiles
  let pr: PullRequest;

  if (state.branchPreviouslyCreated) { // check if already PR for branch
    const prResults = await getMergeToMasterPR(server, owner, repo, token, state);
    if (prResults.error) {
      return prResults;
    }
    if (prResults.matchedPullRequest) {
      pr = prResults.matchedPullRequest;
    }
  }

  // @ts-ignore
  if (pr) {
    console.log(`updateFilesInBranch - PR already exists`);
  } else {
    console.log(`updateFilesInBranch - creating PR`);
    const title = `Merge ${branch} into master`;
    const body = `This pull request merges ${branch} into master.`;
    pr = await createPullRequest(server, owner, repo, branch, "master", title, body, token);
    console.log(`updateFilesInBranch - Pull request created: #${pr.number} - ${pr.url}`);
    state.prNumber = pr.number;
    state.prURL = getManualPullRequest(server, owner, repo, pr.number);
  }

  const prStatus = await getChangedFiles(server, owner, repo, pr.number, token);
  if (!prStatus?.length) {
    console.log(`updateContentOnDCS - PR #${pr.number} has no changes, deleting PR`);
    state.mergeComplete = await deleteTheBranchAndPR(server, owner, repo, pr, token, branch);
    state.noChanges = true;
  } else {
    console.log(`updateContentOnDCS - PR #${pr.number} has ${prStatus?.length} changes`, prStatus);
    if (!pr.mergeable) {
      console.warn(`updateContentOnDCS - PR #${pr.number} is not mergeable`);
    } else if (pr.merged) {
      console.warn(`updateContentOnDCS - PR #${pr.number} has already been merged, deleting PR`);
      state.mergeComplete = await deleteTheBranchAndPR(server, owner, repo, pr, token, branch);
      state.noChanges = true;
    } else {
      console.log(`updateContentOnDCS - merging PR #${pr.number}`);
      const response = await squashMergePullRequest(server, owner, repo, pr.number, true, token, 2);
      if (response.error) {
        return response;
      }
      console.log(`updateContentOnDCS - merged PR`);
      state.mergeComplete = true;
      updateSavedData = true;
    }
  }

  if (updateSavedData) {
    console.log(`updateContentOnDCS - updating saved data`);
    const branch = await getRepoBranch(server, owner, repo, "master", token);
    const commit = branch?.commit?.id || null;
    state.updatedSavedData = true;
    // save latest upload data
    const newStatus = {
      files: uploadedFiles,
      commit,
      lastState: state,
    };
    fs.outputJsonSync(path.join(localRepoPath, dcsStatusFile, owner), newStatus);
  }

  console.log(`updateContentOnDCS - upload complete`);

  // @ts-ignore
  return {
    localFiles,
    uploadedFiles,
    lastState: state,
  };
}

async function makeSureRepoAndBranchExistUploadChangedContentAndMerge(server: string, owner: string, repo: string, token: string, repoExists: boolean, localRepoPath: string, dcsState: DcsUploadStatus, state: GeneralObject, updateSavedData: boolean) {
  // @ts-ignore
  const previousCommit:string = dcsState?.commit || '';
  
  const _results = await makeSureBranchExists(server, owner, repo, token, mergeToMasterBranch, repoExists, previousCommit);
  if (_results?.error) {
    return _results;
  }
  state.newRepo = _results?.newRepo
  state.newBranch = _results?.newBranch
  if (!state.newBranch) {
    state.branchPreviouslyCreated = true
  }

  return await updateFilesAndMergeToMaster(localRepoPath, server, owner, repo, token, dcsState, state, updateSavedData);
}

async function checkIfMasterBranchHasChanged(dcsState: DcsUploadStatus, server: string, owner: string, repo: string, token: string) {
  // @ts-ignore
  const lastMasterCommit: string = dcsState?.commit;
  const masterCurrent = await getRepoBranch(server, owner, repo, "master", token);
  const masterCommit = masterCurrent?.commit?.id || null;

  // validate the last update against the current branch commit
  const masterChanged = lastMasterCommit && (masterCommit !== lastMasterCommit);
  return masterChanged;
}

function checkforCheckingMergeBranches(branchesResult: GetBranchesResult, state: GeneralObject) {
  console.log(`updateContentOnDCS - found ${branchesResult?.branches?.length} Branches`);

  const mergeToMaster = branchesResult.branches.find(branch => (branch.name === mergeToMasterBranch));
  const mergeFromMaster = branchesResult.branches.find(branch => (branch.name === mergeFromMasterBranch));
  state.branchExists = !!mergeToMaster;
  state.branchPreviouslyCreated = state.branchExists;
  if (mergeToMaster) {
    state.mergeToMaster = mergeToMasterBranch;
  }
  if (mergeFromMaster) {
    state.mergeToMaster = mergeFromMasterBranch;
  }

  if (state.branchPreviouslyCreated) {
    console.log(`updateContentOnDCS - merge to master branch already exists`);
  }
  return { mergeToMaster, mergeFromMaster };
}

async function handleFreshDcsUpload(repoExists: boolean, server: string, owner: string, repo: string, token: string, localRepoPath: string, dcsState: DcsUploadStatus, state: GeneralObject, updateSavedData: boolean) {
  if (repoExists) {
    const message = `updateContentOnDCS - content already exists on server`;
    console.warn(message);
    return {
      error: message,
      errorPreviousContentOnServer: true,
    };
  } else {
    // if no repo yet, do fresh upload
    return await makeSureRepoAndBranchExistUploadChangedContentAndMerge(server, owner, repo, token, repoExists, localRepoPath, dcsState, state, updateSavedData);
  }
}

async function handlePreviousDcsUpload(repoExists: boolean, server: string, owner: string, repo: string, token: string, localRepoPath: string, dcsState: DcsUploadStatus, state: GeneralObject, updateSavedData: boolean) {
  state.previousState = dcsState.lastState
  
  if (!repoExists) {
    return await makeSureRepoAndBranchExistUploadChangedContentAndMerge(server, owner, repo, token, repoExists, localRepoPath, dcsState, state, updateSavedData);
  } else {
    const masterChanged = await checkIfMasterBranchHasChanged(dcsState, server, owner, repo, token);
    if (masterChanged) {
      const message = `updateContentOnDCS - master branch SHA changed`;
      console.error(message);
      return {
        error: message,
        errorMergeConflict: true,
      };
    }

    // else master unchanged from last upload
    const branchesResult = await getRepoBranches(server, owner, repo, token);
    if (branchesResult?.error) {
      return branchesResult;
    }

    const { mergeToMaster, mergeFromMaster } = checkforCheckingMergeBranches(branchesResult, state);

    if (!mergeToMaster) {
      return await makeSureRepoAndBranchExistUploadChangedContentAndMerge(server, owner, repo, token, repoExists, localRepoPath, dcsState, state, updateSavedData);
    } else {
      return await updateFilesAndMergeToMaster(localRepoPath, server, owner, repo, token, dcsState, state, updateSavedData);
    }
  }
}

export async function updateContentOnDCS(server: string, owner: string, repo: string, token: string, localRepoPath:string, state:GeneralObject): Promise<GeneralObject> {
  console.log(`updateContentOnDCS - updating repo ${owner}/${repo}`)
  let dcsState: DcsUploadStatus = readJsonFile(path.join(localRepoPath, dcsStatusFile, owner))
  state.branchExists = false;
  state.branchPreviouslyCreated = false
  state.newBranch = false;
  state.newRepo = false;
  let updateSavedData = false
  state.mergeComplete = false
  state.server = server
  state.owner = owner
  state.repo = repo
  state.localRepoPath = localRepoPath

  const repoExists = await checkIfRepoExists(server, owner, repo, token);
  const lastState = dcsState?.lastState as GeneralObject;
  if (!lastState) {
    return await handleFreshDcsUpload(repoExists, server, owner, repo, token, localRepoPath, dcsState, state, updateSavedData);
  } else { // if previous upload
    return await handlePreviousDcsUpload(repoExists, server, owner, repo, token, localRepoPath, dcsState, state, updateSavedData);
  }

  return {
    error: 'Unhandled DCS State',
    errorUnhandledState: true,
  };
}

function updateDcsStatus(key:string, state:GeneralObject, localRepoPath:string, owner:string) {
  if (key) {
    const statusPath = path.join(localRepoPath, dcsStatusFile, owner);
    const dcsState = readJsonFile(statusPath) || {};
    dcsState[key] = state;
    fs.outputJsonSync(statusPath, dcsState);
  }
}

function addErrorToDcsStatus(state:GeneralObject, errorResults:GeneralObject, localRepoPath:string, owner:string) {
  const newState = {
    ...state,
    ...errorResults,
  }
  updateDcsStatus('lastState', newState, localRepoPath, owner)
}

function getProjectsForChecking(localRepoPath: string, checkingSubPath: string, checkingFileType: string, projects: GeneralObject[]) {
  try {
    // get checking files
    const tnCheckingPath = path.join(localRepoPath, checkingSubPath);
    let files = getFilesOfType(tnCheckingPath, checkingFileType);
    files.forEach((file: string) => {
      const bookId = path.basename(file);
      const project = {
        identifier: file,
        title: `Checking ${bookId}`,
        path: `./${checkingSubPath}/${file}`,
      };
      projects.push(project);
    });
  } catch (e) {
    console.warn(`getCheckingFiles - error updating projects list for ${checkingSubPath}`);
  }
}

export function getCheckingFiles(localRepoPath: string) {
  const projects: GeneralObject[] = []

  getProjectsForChecking(localRepoPath, "checking/tn", ".tn_check", projects);
  getProjectsForChecking(localRepoPath, "checking/twl", ".twl_check", projects);

  return projects
}

function updateOutputFiles(localRepoPath: string) {
  const outputFolder = "output_READONLY";

  try {
    // output tn TSV
    const tnCheckingPath = path.join(localRepoPath, "checking/tn");
    let files = getFilesOfType(tnCheckingPath, ".tn_check");
    files.forEach((file: string) => {
      const filePath = path.join(tnCheckingPath, file);
      const checkData = readJsonFile(filePath);
      const groupData = flattenGroupData(checkData);
      const tsv = checkDataToTn(groupData);
      if (tsv) {
        const outputPath = path.join(localRepoPath, outputFolder, file + ".tsv");
        fs.outputFileSync(outputPath, tsv, "UTF-8");
      }
    });
  } catch (e) {
    console.warn(`updateOutputFiles - error updating tN tsv`)
  }

  try {
    // output twl TSV
    const twlCheckingPath = path.join(localRepoPath, "checking/twl");
    const files = getFilesOfType(twlCheckingPath, ".twl_check");
    files.forEach((file: string) => {
      const filePath = path.join(twlCheckingPath, file);
      const checkData = readJsonFile(filePath);
      const groupData = flattenGroupData(checkData);
      const tsv = checkDataToTwl(groupData);
      if (tsv) {
        const outputPath = path.join(localRepoPath, outputFolder, file + ".tsv");
        fs.outputFileSync(outputPath, tsv, "UTF-8");
      }
    });
  } catch (e) {
    console.warn(`updateOutputFiles - error updating twl tsv`)
  }
  
  try {
    const metaData = getMetaData(localRepoPath)
    const { targetLanguageId } = metaData?.["translation.checker"]

    const targetBiblePath = path.join(localRepoPath, 'targetBible')
    const books = getBibleBookFolders(targetBiblePath)
    books.forEach((bookId:string) => {
      const bookPath = path.join(targetBiblePath, bookId)
      const chapters = getFilesOfType(bookPath, `.json`)
      const bookData = { chapters: {} }
      chapters.forEach((fileName:string) => {
        const filePath = path.join(bookPath, fileName)
        const chapterData = readJsonFile(filePath)
        if (fileName.toLowerCase() === 'headers.json') {
          // @ts-ignore
          bookData.headers = chapterData
        } else {
          const chapter = path.parse(fileName).name
          // @ts-ignore
          bookData.chapters[chapter] = chapterData
        }
      })
      const USFM = convertJsonToUSFM(bookData)
      const outputPath = path.join(localRepoPath, outputFolder, `targetBible-${targetLanguageId}-${bookId}.USFM`);
      fs.outputFileSync(outputPath, USFM, "UTF-8");
    })
  } catch (e) {
    console.warn(`updateOutputFiles - error updating twl tsv`)
  }
}

export async function uploadRepoToDCS(server: string, owner: string, repo: string,  token: string, localRepoPath:string): Promise<GeneralObject> {
  updateOutputFiles(localRepoPath);
  const state = {} // for keeping track of current state
  try {
    const results = await updateContentOnDCS(server, owner, repo, token, localRepoPath, state);
    if (results.error) {
      console.error(`uploadRepoToDCS - upload error: ${results.error}`)
      addErrorToDcsStatus(state, results, localRepoPath, owner)
      results.lastState = state
    }
    return results
  } catch (error) {
    // @ts-ignore
    const message = error?.message || error?.toString()
    const _message = `Error: ${message}`;
    // @ts-ignore
    const status: number = error.status;
    // @ts-ignore
    const _error = {
      // @ts-ignore
      error: _message,
      errorData: error,
      status: status,
    };
    addErrorToDcsStatus(state, _error, localRepoPath, owner)
    return _error
  }
}