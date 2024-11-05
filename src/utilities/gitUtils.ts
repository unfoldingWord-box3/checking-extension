import axios from "axios";
// @ts-ignore
import * as fs from "fs-extra";

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
  error?: string;
  status?: number;
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
  status?: number;
}

export async function getOwners(server: string, token: string = ''): Promise<GetOwnersType> {

  const url = `${server}/api/v1/catalog/list/owners?stage=latest`;
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

export interface Repository {
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
  status?: number;
}

export async function getCheckingRepos(server: string, token: string = ''): Promise<GetReposType> {
  const url = `${server}/api/v1/repos/search?q=%5C_checking`
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

interface CatalogItem {
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

interface CatalogSearchResultType {
  catalog?: CatalogItem[];
  error?: string;
  status?: number;
}

export async function searchCatalogByTopic(
  server: string,
  topic: string,
  token: string = ''
): Promise<CatalogSearchResultType> {
  const url = `${server}/api/v1/catalog/search?topic=${topic}&stage=latest`;
  const headers = token ?
    {
      "Authorization": `token ${token}`,
    } : {};

  try {
    const response = await axios.get(url, { headers });
    const catalog = response.data.data as CatalogItem[];
    return { catalog };
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

export async function checkCommitInBranch(
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

export interface UploadFileResponse {
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

export interface ModifyFileResponse {
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

export async function uploadRepoDiffPatchFile(
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

export interface GetBranchesResult {
  branches: Branch[];
  status?: number;
  error?: undefined|string;
}

export async function getRepoBranches(
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

export function getManualPullRequest(server: string, owner: string, repo: string, prNumber: number): string {
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

export async function getFileFromBranch(
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


export interface PullRequest {
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

export async function getOpenPullRequests(
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

export async function getRepoBranch(
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

interface TopicData {
  content: string;
  error?: string;
  status?: number;
}

export async function addTopicToRepo(
  server: string,
  owner: string,
  repo: string,
  topic: string,
  token: string
): Promise<TopicData> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/topics/${topic}`;
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
  };
  const data = {};

  try {
    const response = await axios.put(url, data, { headers });
    const content = response.data
    return { content };
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

