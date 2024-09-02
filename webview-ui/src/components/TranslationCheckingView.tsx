// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";

// @ts-ignore
import AuthContextProvider from '../dcs/context/AuthContext'

import type { TnTSV } from "../../../types/TsvTypes"
import { ResourcesObject } from "../../../types";
import { makeStyles } from "@material-ui/core";
import MenuIcon from '@material-ui/icons/Menu'
// @ts-ignore
import { APP_NAME, APP_VERSION } from "../common/constants.js";
// @ts-ignore
import CommandDrawer from "../dcs/components/CommandDrawer.jsx";
import TranslationChecking from "./TranslationChecking";


type CommandToFunctionMap = Record<string, (data: any) => void>;

type TranslationNotesViewProps = {
    chapter: number;
    verse: number;
};

// @ts-ignore
const useStyles = makeStyles(theme => ({
    root: {
        display: 'flex',
        flexGrow: 1,
        flexDirection: 'row',
        backgroundColor: '#19579E',
        color: '#FFFFFF',
        padding: '10px',
        margin: '0px',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    button: {
        minWidth: '40px',
        padding: '5px 0px',
        marginRight: theme.spacing(3),
    },
    icon: { width: '40px' },
    menuButton: { marginRight: theme.spacing(1) },
    title: {
        flexGrow: 1,
        cursor: 'pointer',
        backgroundColor: '#19579E',
        marginBottom: '10px',
        fontSize: '16px',
        fontWeight: 'bold'
    },
}))

let getSecretCallback:any = null

console.log("TranslationCheckingView.tsx")

function TranslationCheckingView() {
    const [checkingObj, setCheckingObj] = useState<ResourcesObject>({});

    async function initiData(data: TnTSV) {
        setCheckingObj(data);
    }

    const handleMessage = (event: MessageEvent) => {
        const { command, data } = event.data;
        console.log(`handleMessage`, data)

        const update = (data: TnTSV) => {
            initiData(data);
        };

        const getSecretResponse = (value: string|undefined) => {
            if (getSecretCallback) {
                getSecretCallback(value);
                getSecretCallback = undefined // clear callback after use
            } else {
                console.error(`No handler for getSecret response`)
            }
        };

        const commandToFunctionMapping: CommandToFunctionMap = {
            ["update"]: update,
            ["getSecretResponse"]: getSecretResponse,
        };

        commandToFunctionMapping[command](data);
    };

    const secretProvider = {
        getItem: async (key:string) => {
            let data = await getSecret(key)
            // @ts-ignore
            const value = data?.value;
            return value
        },
        setItem: async (key:string, value:any) => {
            await setSecret(key, value)
        },
        removeItem: async (key:string) => {
            await setSecret(key, '')
        }
    }

    async function setSecret(key:string, value:any) {
        const promise = new Promise<string>((resolve) => {
             vscode.postMessage({
                command: "saveSecret",
                text: "Save Secret",
                data: { key, value },
            });
            resolve(value)
        })
        return promise
    }

    // @ts-ignore
    async function getSecret(key:string):Promise<string> {
        const promise = new Promise<string>((resolve) => {
            getSecretCallback = resolve
            vscode.postMessage({
                command: "getSecret",
                text: "Get Secret",
                data: { key }
            });
        })
        return promise
    }

    function sendFirstLoadMessage() {
        vscode.postMessage({
            command: "loaded",
            text: "Webview first load success",
        });
    }
    
    useEffect(() => {
        window.addEventListener("message", handleMessage);
        sendFirstLoadMessage();

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);
    
    return (
      <>
          <AuthContextProvider
            storageProvider={secretProvider}
            ready={!!(checkingObj && Object.keys(checkingObj).length)}
          >
              {/*<StoreContextProvider>*/}
              <TranslationChecking
                checkingObj={checkingObj}
              />
              {/*</StoreContextProvider>*/}
          </AuthContextProvider>
      </>
    );
}

export default TranslationCheckingView;
