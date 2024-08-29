import React, { createContext, useEffect, useState } from "react";
import localforage from 'localforage'
import { AuthenticationContextProvider } from 'gitea-react-toolkit'
import {
  BASE_URL,
  CLOSE,
  HTTP_GET_MAX_WAIT_TIME,
  QA_BASE_URL,
  SERVER_KEY,
  TOKEN_ID,
} from '../../common/constants'
import {
  doFetch,
  processNetworkError,
  unAuthenticated,
} from '../utils/network'
import CustomDialog from "../components/CustomDialog";
// @ts-ignore
import isEqual from 'deep-equal'
export const AuthContext = createContext({})
export const AUTH_KEY = 'authentication';

function processResponse(data) {
  const results = data && Object.keys(data).length ? data : null
  return results
}

export default function AuthContextProvider(props) {
  const [authentication, setAuthentication] = useState(null)
  const [dialogContent, _setDialogContent] = useState(null)
  const [networkError, _setNetworkError] = useState(null)
  const [initialized, setInitialized] = useState(false)
  // const defaultServer = (process.env.NEXT_PUBLIC_BUILD_CONTEXT === 'production') ? BASE_URL : QA_BASE_URL
  const defaultServer = QA_BASE_URL
  const [server, setServer] = useState(defaultServer)

  const myStorageProvider = props.storageProvider || { }
  const ready = props.ready

  useEffect(() => {
    async function initData() {
      const auth = await myStorageProvider.getItem(AUTH_KEY);
      const server = await myStorageProvider.getItem(SERVER_KEY);

      const _auth = processResponse(auth)
      if (!isEqual(authentication, _auth)) {
        setAuthentication(_auth);
      }
      const _server = processResponse(server) || defaultServer
      setServer(_server)
      setInitialized(true)
    }
    if (ready) {
      initData();
    }
  }, [ready])

  /**
   * in the case of a network error, process and display error dialog
   * @param {string|Error} error - initial error message or object
   * @param {number} httpCode - http code returned
   */
  function processError(error, httpCode=0) {
    processNetworkError(error, httpCode, null, null, setNetworkError, null, null )
  }

  function setNetworkError(content) {
    _setNetworkError(content)
    showDialogContent({ message: content })
  }
  
  function showDialogContent({ message, closeButtonStr }) {
    if (message) {
      _setDialogContent({
        message,
        closeButtonStr,
      });
    } else {
      _setDialogContent(null)
    }
  }

  function clearContent() {
    if (networkError) {
      _setNetworkError(null);
    }
    showDialogContent(null)
  }

  // const myAuthStore = localforage.createInstance({
  //   driver: [localforage.INDEXEDDB],
  //   name: 'my-auth-store',
  // })
  
  // const setStorageProvider = (storageProvider) => {
  //   myStorageProvider = storageProvider
  // }

  const getAuth = async () => {
    if (initialized) {
      let auth
      if (!authentication?.user) {
        auth = await myStorageProvider.getItem(AUTH_KEY);
      } else {
        auth = authentication
      }

      if (auth) { // verify that auth is still valid
        doFetch(`${server}/api/v1/user`, auth, HTTP_GET_MAX_WAIT_TIME)
          .then(response => {
            const httpCode = response?.status || 0;

            if (httpCode !== 200) {
              console.log(`getAuth() - error fetching user info, status code ${httpCode}`);

              if (unAuthenticated(httpCode)) {
                console.error(`getAuth() - user not authenticated, going to logout`);
                logout();
              } else {
                processError(null, httpCode);
              }
            }
          }).catch(e => {
          if (e.toString().includes("401")) { // check if 401 code in exception
            console.error(`getAuth() - user token expired`);
            logout();
          } else {
            console.warn(`getAuth() - hard error fetching user info, error=`, e);
            processError(e);
          }
        });
      }
      return auth;
    }
    return null
  }

  const saveAuth = async authentication => {
    if (authentication === undefined || authentication === null) {
      await myStorageProvider.removeItem(AUTH_KEY)
    } else {
      await myStorageProvider.setItem(AUTH_KEY, authentication)
      console.info(
        'saveAuth() success. authentication user is:',
        authentication.user.login,
      )
    }
  }

  const onError = (e) => {
    console.warn('AuthContextProvider - auth error', e)
    processError(e?.errorMessage)
  }

  async function logout() {
    await myStorageProvider.removeItem(AUTH_KEY)
    setAuthentication(null)
  }

  const value = {
    state: {
      authentication,
      networkError,
      server,
    },
    actions: {
      logout,
      showDialogContent,
      setNetworkError,
      setServer,
    },
  }

  return (
    <AuthContext.Provider value={value}>
      <AuthenticationContextProvider
        config={{
          server,
          tokenid: TOKEN_ID,
          timeout: HTTP_GET_MAX_WAIT_TIME,
        }}
        authentication={authentication}
        onAuthentication={setAuthentication}
        loadAuthentication={getAuth}
        saveAuthentication={saveAuth}
        onError={onError}
      >
        {props.children}
      </AuthenticationContextProvider>
      <CustomDialog
        open={!!dialogContent?.message}
        content={dialogContent?.message}
        onClose={() => clearContent()}
        closeButtonStr={dialogContent?.closeButtonStr || CLOSE}
      />
    </AuthContext.Provider>
  )
}
