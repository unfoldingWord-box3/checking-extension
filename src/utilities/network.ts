import axios from 'axios';
import { getRepoFileName, projectsBasePath } from "./resourceUtils";
// @ts-ignore
import * as fs from "fs-extra";
import * as path from 'path';
import {
  getAllFiles,
  getChecksum,
  readJsonFile
} from "./fileUtils";
import { ResourcesObject } from "../../types";

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

export async function getRepoTree(server: string, owner: string, repo: string, sha: string, token: string): Promise<RepoResponseItem> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/git/trees/${sha}?recursive=true`;
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${token}`
      }
    });
    return response.data;
  } catch (error) {
    // @ts-ignore
    const errorMsg = `Error: ${error.message}`
    console.error(errorMsg);
    // @ts-ignore
    return { error: errorMsg};
  }
}

export async function checkRepoExists(server: string, owner: string, repo: string, token: string): Promise<boolean> {
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
    if (error.response && error.response.status === 404) {
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
    old_branch_name: sourceBranch,
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
  status: number;
  error: undefined|string;
}

export async function uploadRepoFile(server: string, owner: string, repo: string, branch: string, filePath: string, content: Buffer, token: string): Promise<UploadFileResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}`;
  const data = {
    content: content.toString('base64'),
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
  const content = fs.readFileSync(sourceFilePath);
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
  status: number;
  error: undefined|string;
}

export async function modifyRepoFile(server: string, owner: string, repo: string, branch: string, filePath: string, content: Buffer, token: string, sha: string): Promise<UploadFileResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/contents/${filePath}`;
  const data = {
    content: content.toString('base64'),
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

export async function modifyRepoFileFromPath(server: string, owner: string, repo: string, branch: string, uploadPath: string, sourceFilePath: string, token: string, sha: string): Promise<ModifyFileResponse> {
  const content = fs.readFileSync(sourceFilePath);
  const results = await modifyRepoFile(server, owner, repo, branch, uploadPath, content, token, sha)
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
  status: number;
  error: undefined|string;
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

interface CreatePullRequestResponse {
  id: number;
  mergeable: boolean;
  merged: boolean;
  number: number;
  url: string;
  // Add other fields as needed
}

export async function createPullRequest(server: string, owner: string, repo: string, branchToMergeFrom: string, branchToMergeInto: string, title: string, body: string, token: string): Promise<CreatePullRequestResponse> {
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

type NestedObject = {
  [key: string]: {
    [innerKey: string]: any;
  };
};

interface MergePullRequestResponse {
  message: string;
  url: string;
  // Add other fields as needed
}

export async function squashMergePullRequest(server: string, owner: string, repo: string, pullNumber: number, autoDelete: boolean, token: string): Promise<MergePullRequestResponse> {
  const url = `${server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const data = {
    Do: "squash",
    MergeMessageField: `Squash merge pull request #${pullNumber}`,
    delete_branch_after_merge: autoDelete,
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

interface PullRequest {
  id: number;
  title: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
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

type DcsUploadStatus = {
  files: NestedObject;
  commit: ResourcesObject
}

const dcsStatusFile = '.dcs_upload_status'

async function deleteTheBranchAndPR(server: string, owner: string, repo: string, pr: CreatePullRequestResponse, token: string, branch: string) {
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

export async function updateFilesInDCS(server: string, owner: string, repo: string, branch: string, token: string, localRepoPath:string): Promise<NestedObject> {
  console.log(`updateFilesInBranch - updating repo ${owner}/${repo}`)
  const lastRepo: DcsUploadStatus = readJsonFile(path.join(localRepoPath, dcsStatusFile)) || {}

  let newRepo = false
  const repoExists = await checkRepoExists(server, owner, repo, token)
  if (!repoExists) {
    console.log(`updateFilesInBranch - creating repo ${owner}/${repo}`)
    const results = await createCheckingRepository(server, owner, repo, token)
    if (results?.error) {
      console.error(`updateFilesInBranch - error creating repo`)
      throw results?.error
    }
    newRepo = true
  }

  const branchExists = await checkBranchExists(server, owner, repo, branch, token)
  if (!branchExists) {
    console.log(`updateFilesInBranch - creating repo branch ${branch}`)
    const results = await createRepoBranch(server, owner, repo, branch, token)
    if (results?.error) {
      console.error(`updateFilesInBranch - error creating branch ${branch}`)
      throw results?.error
    }
  }

  // @ts-ignore
  const lastCommit: string = lastRepo?.commit
  const branchCurrent = await getRepoBranch(server, owner, repo, 'master', token)
  const currentCommit = branchCurrent?.commit?.id || null

  // validate the last update against the current branch commit
  const masterChanged = lastCommit &&  (currentCommit !== lastCommit)
  if (masterChanged) {
    const message = `updateFilesInBranch - master branch changed`;
    console.error(message)
    throw message
  }

  const localFiles = getAllFiles(localRepoPath);
  const results = await getRepoTree(server, owner, repo, branch, token)
  const handledFiles: NestedObject = {}
  let uploadedFiles: NestedObject = lastRepo?.files || {}
  if (newRepo) { // if new repo then upload everything
    uploadedFiles = {}
  }
  
  for(const file of results?.tree || []) {
    // @ts-ignore
    handledFiles[file.path] = file
  }
  
  for (const localFile of localFiles) {
    if ((localFile === dcsStatusFile) || (localFile === '.DS_Store')) { // skip over DCS data file, and system files
      continue
    }

    const fullFilePath = path.join(localRepoPath, localFile)
    let doUpload = false
    let skip = false
    let localChecksum: string = ''

    const remoteFileData = handledFiles[localFile];
    const isOnDcs = !!remoteFileData
    if (!isOnDcs) {
      doUpload = true
    } else {
      localChecksum = await getChecksum(fullFilePath)
      const lastUploadData = uploadedFiles[localFile]
      const lastSha = lastUploadData?.sha
      if ((lastUploadData?.checksum === localChecksum) && (remoteFileData?.sha === lastSha)) {
        // if checksum unchanged and sha unchanged, then skip this file
        skip = true
      }
    }

    let results = null
    if (!skip) {
      if (doUpload) {
        console.log(`updateFilesInBranch - uploading file ${localFile}`)
        results = await uploadRepoFileFromPath(server, owner, repo, branch, localFile, fullFilePath, token);
      } else {
        console.log(`updateFilesInBranch - updating changed file ${localFile}`)
        const sha = remoteFileData?.sha || "";
        results = await modifyRepoFileFromPath(server, owner, repo, branch, localFile, fullFilePath, token, sha);
      }

      if (!results?.error) {
        // @ts-ignore
        const fileData = results.content;
        const checksum = await getChecksum(fullFilePath)
        const newFileData = {
          ...fileData,
          checksum
        };
        // @ts-ignore
        delete newFileData['content']
        uploadedFiles[localFile] = newFileData
        if (isOnDcs) {
          delete handledFiles[localFile]
        }
      } else {
        console.error(results?.error)
      }
    } else {
      delete handledFiles[localFile]
    }
  }

  for (const file of Object.keys(handledFiles)) {
    const fileData = handledFiles[file]
    const fileType = fileData?.type;
    if (fileType === 'file' || fileType === 'blob') {
      console.log(`updateFilesInBranch - deleting ${file}`)

      const sha = fileData?.sha || ''
      const results = await deleteRepoFile(server, owner, repo, branch, file, token, sha)

      if (results?.error) {
        console.log (results)
      }
    }
  }

  console.log(`updateFilesInBranch - creating PR`)
  const title = `Merge ${branch} into master`;
  const body = `This pull request merges ${branch} into master.`;
  const pr = await createPullRequest(server, owner, repo, branch, 'master', title, body, token)
  console.log(`updateFilesInBranch - Pull request created: #${pr.number} - ${pr.url}`);

  let updateSavedData = false
  let mergeComplete = false
  
  const prStatus = await getChangedFiles(server, owner, repo, pr.number, token)
  if (!prStatus?.length) {
    console.log(`updateFilesInBranch - PR #${pr.number} has no changes, deleting PR`)
    mergeComplete = await deleteTheBranchAndPR(server, owner, repo, pr, token, branch);
  } else {
    if (!pr.mergeable) {
      console.warn(`updateFilesInBranch - PR #${pr.number} is not mergeable`);
    } else if (pr.merged) {
      console.warn(`updateFilesInBranch - PR #${pr.number} has already been merged, deleting PR`);
      mergeComplete = await deleteTheBranchAndPR(server, owner, repo, pr, token, branch);
    } else {
      console.log(`updateFilesInBranch - merging PR #${pr.number}`);
      const response = await squashMergePullRequest(server, owner, repo, pr.number, true, token);
      console.log(`updateFilesInBranch - merged PR`);
      mergeComplete = true;
      updateSavedData = true;
    }
  }
  
  if (updateSavedData) {
    const branch = await getRepoBranch(server, owner, repo, 'master', token)
    const commit = branch?.commit?.id || null
    // save latest upload data
    const newDcsStatus = {
      files: uploadedFiles,
      commit,
    };
    fs.outputJsonSync(path.join(localRepoPath, dcsStatusFile), newDcsStatus);
  }
  
  console.log(results)
  // @ts-ignore
  return {
    ...results,
    localFiles,
    uploadedFiles,
    // @ts-ignore
    mergeComplete,
  } 
}

export async function uploadRepoToDCS(server: string, owner: string, repo: string,  token: string, localRepoPath:string, targetLanguageId:string, targetBibleId:string, glLanguageId:string, bookId: string = ''): Promise<boolean> {
  const branch = getNewBranchName(targetLanguageId, targetBibleId, glLanguageId, bookId)
  try {
    const results = await updateFilesInDCS(server, owner, repo, branch, token, localRepoPath);
    if (!results.error) {
      return true
    } else {
      console.error(`uploadRepoToDCS - upload error: ${results.error}`)
    }
  } catch (e) {
    // @ts-ignore
    console.error(`uploadRepoToDCS - exception: ${e.toString()}`)
  }
  return false
}