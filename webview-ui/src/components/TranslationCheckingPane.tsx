/**
 * TranslationCheckingPane Component
 *
 * ## Synopsis
 * The primary UI component for the VS Code translation checking extension that provides an interactive interface for checking translated scripture against gateway languages.
 *
 * ## Description
 * TranslationCheckingPane is a React component that renders the main checking interface for Translation Words List (TWL) and Translation Notes (TN) checking workflows. It integrates with the checking-tool-rcl library to provide comprehensive translation validation capabilities within VS Code. The component manages the display of checking resources, handles user interactions, and coordinates with the extension backend for file operations and data persistence.
 *
 * The component supports both TWL (Translation Words) and TN (Translation Notes) checking modes, providing different interfaces and data structures for each type. It includes features for project management, resource validation, DCS (Door43 Content Service) integration, and multi-language support.
 *
 * ## Properties
 * @param checkingObj - Main resources object containing all checking data including target Bible, gateway language resources, lexicons, and checking files
 * @param createNewOlCheck - Function to create a new Original Language checking project with callback for status updates
 * @param initialContextId - Initial context object specifying the current check position (book, chapter, verse, etc.)
 * @param openCheckingFile - Function to open checking files in the editor, accepts boolean for TN vs TWL selection
 * @param projectKey - Unique identifier for the current checking project based on language, resource, and book IDs
 * @param promptUserForOptionCallback - Callback function for handling user prompts and option selections
 * @param saveCheckingData - Function to persist checking data changes back to the file system
 * @param uploadToDCS - Function to upload checking results to Door43 Content Service with progress callback
 *
 * ## Requirements
 * - React 18.2.0+ with hooks support
 * - Material-UI components for styling and layout
 * - checking-tool-rcl library for core checking functionality
 * - VS Code webview messaging API for backend communication
 * - Valid checking resources (target Bible, gateway language resources, checking files)
 * - Project metadata with language and resource configuration
 */

import React, { useContext, useEffect, useState } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";
import {
    Checker,
    TranslationUtils,
    twArticleHelpers,
}
// @ts-ignore
from 'checking-tool-rcl'

// Type definitions and utility imports
import { GeneralObject, ResourcesObject } from "../../../types/index";
import { ALL_BIBLE_BOOKS } from "../../../src/utilities/BooksOfTheBible";

// Material-UI components for consistent styling
import {
  AppBar,
  CircularProgress,
  IconButton,
  makeStyles,
  Toolbar,
  Typography,
} from "@material-ui/core";

// Material-UI icons for visual feedback
import MenuIcon from '@material-ui/icons/Menu'
import ErrorIcon from '@material-ui/icons/Error';
import DoneOutlineIcon from '@material-ui/icons/DoneOutline';

// Application constants and components
// @ts-ignore
import { APP_NAME, APP_VERSION } from "../common/constants.js";
// @ts-ignore
import CommandDrawer from "../dcs/components/CommandDrawer.jsx";
// @ts-ignore
import { AuthContext } from "../dcs/context/AuthContext";

// Configuration flag to control display of TA/TW reference articles
const showDocument = true // set this to false to disable showing ta or tw articles

// Material-UI theme styles for consistent appearance
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

console.log("TranslationCheckingPane.tsx")

/**
 * Validates that a resource object contains actual content data beyond just manifest information.
 * Resources are considered valid if they have content files in addition to optional manifest data.
 * 
 * @param resource - The resource object to validate
 * @returns boolean indicating whether the resource has sufficient content data
 */
function hasResourceData(resource:object) {
    if (resource) {
        // @ts-ignore
        const minCount = resource?.manifest ? 2 : 1; // If manifest exists, need at least 2 properties
        // @ts-ignore
        let hasResourceFiles = Object.keys(resource).length >= minCount; // need more than just manifest
        return hasResourceFiles;
    }
    return false
}

// Type definitions for component prop functions
type saveCheckingDataFunction = (resources: ResourcesObject) => void;
type uploadToDCSFunction = (server: string, owner: string, token: string, dcsUpdate: (update: object) => void) => Promise<GeneralObject>;
type createNewOlCheckFunction = (data: object, initializeUpdate: (data: object) => void) => Promise<GeneralObject>;
type promptUserForOptionCallbackFunction = (data: GeneralObject) => void;
type openCheckingFileFunction = (openTNotes: boolean) => void;

// Main component props interface
type TranslationCheckingProps = {
  checkingObj: ResourcesObject;
  createNewOlCheck: createNewOlCheckFunction,
  initialContextId: object;
  openCheckingFile: openCheckingFileFunction;
  projectKey: string;
  promptUserForOptionCallback: promptUserForOptionCallbackFunction;
  saveCheckingData: saveCheckingDataFunction;
  uploadToDCS: uploadToDCSFunction;
};

const TranslationCheckingPane: React.FC<TranslationCheckingProps> = ({
   checkingObj,
   createNewOlCheck: _createNewOlCheck,
   initialContextId,
   openCheckingFile,
   projectKey,
   promptUserForOptionCallback,
   saveCheckingData,
   uploadToDCS: _uploadToDCS,
}) => {
    const classes = useStyles()
    // State management for current checking position and drawer visibility
    const [currentContextId, setCurrentContextId] = useState<object>(initialContextId || {});
    const [drawerOpen, setDrawerOpen] = useState(false)

    // Extract checking resources from the main checking object
    const LexiconData:object = checkingObj.lexicons;
    const translations:object = checkingObj.locales
    // @ts-ignore
    const languages:string[] = checkingObj.localeOptions || []
    // @ts-ignore
    const origBibleId:string = checkingObj.origBibleId
    // @ts-ignore
    const origBible:object = checkingObj[origBibleId]?.book
    // Gateway Language Bible data (GLT or ULT)
    const alignedGlBible_ = checkingObj.glt || checkingObj.ult;
    // @ts-ignore
    const alignedGlBible = alignedGlBible_?.book
    const checks:object = checkingObj.checks
    // @ts-ignore
    const haveChecks = hasResourceData(checks)
    const targetBible = checkingObj.targetBible
    const isEmptyProject = checkingObj.EMPTY

    // Authentication context for dialog management
    // @ts-ignore
    const _authContext = useContext(AuthContext);
    // @ts-ignore
    const { showDialogContent } = _authContext?.actions || {}

    // Update context when initial context changes
    useEffect(() => {
      setCurrentContextId(initialContextId)
    }, [initialContextId]);

    /**
     * Translation utility function using the TranslationUtils library.
     * Looks up localized strings based on key with optional data interpolation.
     */
    const translate = (key:string, data:object|null = null, defaultStr: string|null = null) => {
        const translation = TranslationUtils.lookupTranslationForKey(translations, key, data, defaultStr)
        return translation
    };

    /**
     * Retrieves lexicon entry data for a specific lexicon and entry ID.
     * Used by the Checker component to display lexical information.
     */
    const getLexiconData_ = (lexiconId:string, entryId:string) => {
        console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
        // @ts-ignore
        const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
        return { [lexiconId]: { [entryId]: entryData } };
    };

    /**
     * Handles saving of checking data changes by extracting selections and context information,
     * updating the current context if needed, and delegating to the parent save function.
     */
    const _saveCheckingData = (newState:object) => {
        // @ts-ignore
        const selections = newState?.selections
        console.log(`_saveCheckingData - new selections`, selections)
        // @ts-ignore
        const currentContextId = newState?.currentCheck?.contextId
        console.log(`_saveCheckingData - current context data`, currentContextId)
        // @ts-ignore
        const nextContextId = newState?.nextContextId
        // Update current context if moving to next check
        if (currentContextId && nextContextId) {
          setCurrentContextId(nextContextId);
        }
        // @ts-ignore
        saveCheckingData && saveCheckingData(newState)
    }
    
    /**
     * Saves application settings by sending a message to the VS Code extension backend.
     */
    function saveSettings(settings: GeneralObject) {
      vscode.postMessage({
        command: "saveAppSettings",
        text: "Save APP Settings",
        data: { settings },
      });
    }

    // Extract project and language information from checking object
    const contextId = initialContextId || {}
    const project = checkingObj.project;
    // @ts-ignore
    const bookId = project?.bookId
    // @ts-ignore
    const resourceId = project?.resourceId
    // @ts-ignore
    const languageId = project?.languageId || 'en'
    // @ts-ignore
    const targetLanguageName = checkingObj.targetBible?.manifest?.language_name
    // @ts-ignore
    const targetLanguageDirection = checkingObj.targetBible?.manifest?.direction
    // @ts-ignore
    const bookName = ALL_BIBLE_BOOKS[bookId]

    // Configure checking data and type based on resource type (TWL vs TN)
    let glWordsData, checkingData, checkType;
    if (resourceId === 'twl') {
        const glTwData: object = checkingObj.tw; // Translation Words data
        glWordsData = glTwData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationWords'
    } else if (resourceId === 'tn') {
        const glTaData: object = checkingObj.ta; // Translation Academy data
        glWordsData = glTaData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationNotes'
    }

    // Configure target language details for the Checker component
    const bibles = checkingObj?.bibles
    const targetLanguageDetails = {
        id: languageId,
        name: targetLanguageName || languageId,
        direction: targetLanguageDirection || 'ltr',
        book: {
            id: bookId,
            name: bookName
        }
    }

    /**
     * Wrapper function to display dialog content using the authentication context.
     */
    function _showDialogContent(options: object) {
      showDialogContent && showDialogContent(options)
    }

  /**
   * Utility function to render log entries as JSX elements with line breaks.
   */
  function getLogDiv(log: string[]) {
    return (
      <div>
        {
          log.map((item: string) => (
            <>
              <span>{item}</span><br />
            </>
          ))
        }
      </div>
    )
  }

  /**
   * Handles the DCS upload process with real-time progress updates and result display.
   * Shows loading spinner during upload and success/error dialogs upon completion.
   */
  function uploadToDCS(server:string, owner: string, token: string) {
      _showDialogContent({ message: 'Doing Upload to DCS' })
      let log: string[] = []
      // Progress callback for real-time upload status updates
      const dcsUpdateCallback = (update: object) => {
        // @ts-ignore
        const status = update?.status || '';
        // @ts-ignore
        log = update?.log || []
        _showDialogContent({
          message:
            <div>
              <CircularProgress /> <b>Upload is in Process</b>
              <br />
              <span><b>{`Current Status: ${status}`}</b></span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
        })
      }
      // Execute upload and handle results
      _uploadToDCS(server, owner, token, dcsUpdateCallback).then(results => {
        console.log(`uploadToDCS completed with results:`, results)
        // @ts-ignore
        const errorMessage = results?.error;
        if (errorMessage) {
          // Handle upload failure
          let message = errorMessage;
          const lastState = results?.lastState;
          if (lastState) {
            const url = `${lastState.server}/${lastState.owner}/${lastState.repo}`
            message = translate( 'status.uploadError', { message, url })
          }
          const dialogContent = (
            <div>
              <ErrorIcon /> <b>Upload Failed:</b>
              <br />
              <span>{`Current Status: ${message}`}</span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
          )
          _showDialogContent({ message: dialogContent });
        } else {
          // Handle upload success
          let message = translate('status.uploadSuccess')
          const lastState = results?.lastState;
          if (lastState) {
            const url = `${lastState.server}/${lastState.owner}/${lastState.repo}`
            message = translate('status.uploadSuccess', {url})
          }
          const dialogContent =(
            <div>
              <DoneOutlineIcon /> <b>Upload Complete Successfully:</b>
              <br />
              <span>{`Current Status: ${message}`}</span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
          )
          _showDialogContent({ message: dialogContent });
        }
      })
    }

  /**
   * Creates dialog options for user prompts based on prompt type and data.
   * Supports yes/no prompts and option selection prompts with appropriate callbacks.
   */
  function getPrompt(data: object) {
    const NO = translate('buttons.no_button');
    const YES = translate('buttons.yes_button');

    // Default prompt display with raw data (fallback)
    let prompt = <div>
      <span><b>{`Prompt:`}</b></span>
      <hr />
      <b>Data:</b><br />
      {JSON.stringify(data)}
    </div>;

    const options = {
      message: prompt,
    }

    // @ts-ignore
    const message = translate(data?.message);
    // @ts-ignore
    const type = data?.type;
    if (message) {
      // Show loading spinner for busy prompts
      // @ts-ignore
      if (data?.busy) {
        options.message = <div>
          <CircularProgress />
          <span><b>{message}</b></span>
        </div>
      } else {
        options.message = <div>
          <span><b>{message}</b></span>
        </div>;
      }

      // Handle yes/no confirmation prompts
      if (type === 'yes/No') {
        function closeCallbackYesNo(responseStr: String) {
          promptUserForOptionCallback({
            responseStr,
            response: (responseStr === YES),
          });
        }

        // @ts-ignore
        options.closeButtonStr = YES
        // @ts-ignore
        options.otherButtonStr = NO
        // @ts-ignore
        options.closeCallback = closeCallbackYesNo
      }
      
      // Handle option selection prompts
      else if (type === 'option') {
        const OK = translate('buttons.ok_button')

        function closeCallbackOption(responseStr: String) {
          promptUserForOptionCallback({
            responseStr,
            response: responseStr,
          });
        }
        
        // @ts-ignore
        options.message = <div>
          <span><b>{message}</b></span>
          <hr />
        </div>;
        
        // @ts-ignore
        options.closeButtonStr = OK
        // @ts-ignore
        options.closeCallback = closeCallbackOption
        // @ts-ignore
        options.choices = data?.choices
      }
    }
    return options;
  }

  /**
   * Initiates creation of a new Original Language checking project.
   * Shows progress dialogs and handles user prompts during the creation process.
   */
  function createNewOlCheck(e: object) {
    const message = translate('status.creatingCheckingProject')
    _showDialogContent({ message })
    // Callback for handling user prompts during project creation
    const createNewOlCheckCallback = (data: object) => {
      // @ts-ignore
      const status = '';
      const options = getPrompt(data);
      _showDialogContent(options)
    }
    // Execute project creation and handle results
    _createNewOlCheck({ data: 'testing' }, createNewOlCheckCallback).then(results => {
      console.log(`createNewOlCheck completed with results:`, results)
      // @ts-ignore
      const errorMessage = results?.errorMessage;
      if (errorMessage) {
        // Handle creation failure
        const title = translate('status.errorCreatingProjectTitle')
        const message = errorMessage;
        const dialogContent = (
          <div>
            <ErrorIcon /> <b>{title}</b>
            <br />
            <span>{`Message: ${message}`}</span>
          </div>
        )
        _showDialogContent({ message: dialogContent });
      } else {
        // Handle creation success
        const title = translate('status.successCreatingProjectTitle')
        const dialogContent =(
          <div>
            <DoneOutlineIcon /> <b>{title}</b>
          </div>
        )
        _showDialogContent({ message: dialogContent });
      }
    })
  }

  // Automatically create new project when empty project is detected
  useEffect(() => {
    if (isEmptyProject) {
      console.log(`createNewOlCheck empty project detected, create new project`)
      createNewOlCheck({})
    }
  }, [isEmptyProject]);

  // Command drawer event handlers
  const handleDrawerOpen = () => {
        setDrawerOpen(true)
    }

    const handleDrawerClose = () => {
        setDrawerOpen(false)
    }

    /**
     * Handles target verse editing by sending change commands to the VS Code extension.
     * Updates are sent only if all required parameters (bookId, chapter, verse) are present.
     */
    const changeTargetVerse = (chapter:string, verse:string, newVerseText:string, newVerseObjects: object) => {
      if (bookId && chapter && verse) {
        vscode.postMessage({
          command: "changeTargetVerse",
          text: "Change Target Verse",
          data: { bookId, chapter, verse, newVerseText, newVerseObjects },
        });
      }
    }
    
    // Resource validation checks
    const haveCheckingData = hasResourceData(checkingData);
    const hasTargetBibleBook = hasResourceData(checkingObj?.targetBible);
    const haveResources = hasTargetBibleBook && checkingObj.validResources && haveCheckingData

    console.log(`TranslationNotesView - redraw haveResources ${!!haveResources}, haveCheckingData ${!!haveCheckingData}, haveChecks ${!!haveChecks}`)
    
    /**
     * Generates appropriate error messages when required checking resources are missing.
     * Provides specific feedback based on which resources are unavailable.
     */
    function getResourceMissingErrorMsg(checkingObj:any) {
        const defaultMessage = 'Checking resources missing.'
        let message = translate('status.resourceMissing', null, defaultMessage);
        if (!hasTargetBibleBook) {
            message = translate('status.bibleMissing', { bookId }, defaultMessage)
        } else if (checkingObj.validResources) {
            if (!haveCheckingData) {
              const checksPath = `./checking/${checkingObj?.project?.resourceId}/${bookId}.${checkingObj?.project?.resourceId}_check`
                message = translate('status.invalidCheckingFile', { checksPath })
            }
        }
        return message;
    }

  // Extract current language selection and prepare project manifest
  // @ts-ignore
  const currentLanguageSelection = translations?.['_']?.['full_name'] || '';
  let projectManifest = null
  // @ts-ignore
  let _manifest = checkingObj?.targetBible?.manifest;
  const resourceTitle = _manifest?.resource_title || '';
  
  // Build complete manifest with Dublin Core metadata
  if (_manifest) {
    const dublin_core = _manifest?.dublin_core || {}
    let target_language = {  }
    if (dublin_core?.language) {
      target_language = { ...dublin_core.language };
      // @ts-ignore
      target_language.book = {
        name: resourceTitle,
      };
    }
    _manifest = { // shallow copy with merged metadata
      ...dublin_core,
      ..._manifest,
      target_language
    }
  }
  
  // Combine manifest with saved settings for Checker component initialization
  const initialSettings = {
    manifest: _manifest,
    // @ts-ignore
    ...(checkingObj?.metadata?.settings || {})
  }

  // Determine whether to show the checking interface or error message
  const showCheckingPane = haveResources || isEmptyProject;

  // Main render logic
  return showCheckingPane ? (
      <>
        {/* Application header with title and menu */}
        <AppBar position='static'>
          <Toolbar>
            <div id='title-bar' className={classes.root}>
              <IconButton
                edge='start'
                className={classes.menuButton}
                color='inherit'
                aria-label='menu'
                onClick={handleDrawerOpen}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant='h6'
                className={classes.title}
                onClick={() => {
                }}
              >
                {`${APP_NAME} - v${APP_VERSION}`}
              </Typography>
              <Typography
                variant='h1'
                className={classes.title}
                onClick={() => {
                }}
              >
                {`${resourceTitle}`}
              </Typography>
            </div>
          </Toolbar>
        </AppBar>
        
        {/* Command drawer for navigation and project management */}
        <CommandDrawer
          open={drawerOpen}
          onOpen={handleDrawerOpen}
          onClose={handleDrawerClose}
          checkUnsavedChanges={null}
          resetResourceLayout={null}
          showFeedback={null}
          languages={languages}
          currentLanguageSelection={currentLanguageSelection}
          translate={translate}
          uploadToDCS={uploadToDCS}
          createNewOlCheck={createNewOlCheck}
          isEmptyProject={isEmptyProject}
          openCheckingFile={openCheckingFile}
          showDialogContent={_showDialogContent}
        />
        
        {/* Main checking interface or project selection prompt */}
        {!isEmptyProject ? <div id="checkerWrapper" style={{ marginTop: "10px" }}>
          <Checker
            styles={{ width: "97vw", height: "65vw", overflowX: "auto", overflowY: "auto" }}
            alignedGlBible={alignedGlBible}
            bibles={bibles}
            changeTargetVerse={changeTargetVerse}
            checkingData={checkingData}
            checkType={checkType}
            contextId={contextId}
            getLexiconData={getLexiconData_}
            glWordsData={glWordsData}
            initialSettings={initialSettings}
            saveCheckingData={_saveCheckingData}
            saveSettings={saveSettings}
            showDocument={showDocument}
            targetBible={targetBible}
            targetLanguageDetails={targetLanguageDetails}
            translate={translate}
          />
        </div> : 'No Project Selected'}
      </>
    ) : getResourceMissingErrorMsg(checkingObj);
}

export default TranslationCheckingPane;
