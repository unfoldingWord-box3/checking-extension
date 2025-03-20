import React, { useContext } from "react";
import PropTypes from 'prop-types'
import SwipeableDrawer from '@material-ui/core/SwipeableDrawer'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ExitToAppIcon from '@material-ui/icons/ExitToApp'
import SettingsIcon from '@material-ui/icons/Settings'
import BugReportIcon from '@material-ui/icons/BugReport'
import IconButton from '@material-ui/core/IconButton'
import ListItem from '@material-ui/core/ListItem'
import List from '@material-ui/core/List'
import DashboardOutlinedIcon from '@material-ui/icons/DashboardOutlined'
import { AuthContext } from "../context/AuthContext";
import { AuthenticationContext } from "gitea-react-toolkit/dist/components/authentication";
import PersonIcon from '@material-ui/icons/Person';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import CreateNewFolder from '@material-ui/icons/CreateNewFolder';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import LockIcon from '@material-ui/icons/Lock';
// TODO: Enable buttons once ready to fully implement functionality
// import DashboardIcon from '@material-ui/icons/Dashboard'
// import Crop54Icon from '@material-ui/icons/Crop54'
// import FolderIcon from '@material-ui/icons/Folder'
// import Divider from '@material-ui/core/Divider'
// import Button from '@material-ui/core/Button'
import TranslateIcon from '@material-ui/icons/Translate'
import LaunchIcon from '@material-ui/icons/Launch';
import { FormControl, InputLabel, MenuItem, Select } from "@material-ui/core";
import { vscode } from "../../utilities/vscode";


export default function CommandDrawer({
  open,
  onOpen,
  onClose,
  resetResourceLayout,
  checkUnsavedChanges,
  showFeedback,
  languages,
  currentLanguageSelection,
  translate,
  uploadToDCS,
  createNewOlCheck,
  openCheckingFile,
  showDialogContent,
}) {
  const {
    state: {
      server,
    },
    actions: {
      logout,
      getAuth,
      setServer,
    }
  } = useContext(AuthContext)
  const {
    state: authentication,
  } = useContext(AuthenticationContext)
  const user = authentication?.user
  const token = authentication?.token

  async function onSettingsClick() {
    const okToContinue = await checkUnsavedChanges()

    if (okToContinue) {
      onClose()
    }
  }

  function onFeedbackClick() {
    onClose()
    showFeedback && showFeedback()
  }

  async function onLogout() {
    let okToContinue = true
    if (checkUnsavedChanges) {
      okToContinue = await checkUnsavedChanges();
    }

    if (okToContinue) {
      logout()
      onClose()
    }
  }
  
  function languageSelected(event) {
    const newSelection = event.target.value || ''
    console.log(`New language selection ${newSelection}`)
    showDialogContent({
      message: null
    })
    vscode.postMessage({
      command: "setLocale",
      text: "Set Locale",
      data: { value: newSelection }
    });
  }

  function onSelectLocal() {
    onClose()
    showDialogContent({
      message:
        <FormControl fullWidth>
          <InputLabel id="language-select">{translate("menu.select_locale")}</InputLabel>
          <Select
            labelId="language-select"
            id="language-select"
            value={currentLanguageSelection}
            label={translate('menu.select_locale')}
            onChange={languageSelected}
          >
            {
              languages.map(language => 
                <MenuItem value={language}>{language}</MenuItem>
              )
            }
          </Select>
        </FormControl>,
      closeButtonStr: translate('buttons.close_button')
    })
  }
  
  function onLogIn() {
    onClose()
    showDialogContent({
      doLogin: true
    })
  }

  function handleUpload() {
    console.log(`handleUpload`)
    onClose()
    showDialogContent({ message: 'Validating Login' })
    getAuth().then(auth => {
      if (auth) {
         uploadToDCS(server, user?.username, token?.sha1);
      } else {
        showDialogContent({
          message: 'Previous Login is no longer valid.  Need to login again.'
        })
      }
    })
  }

  return (
    <SwipeableDrawer
      anchor='left'
      open={open}
      onClose={onClose}
      onOpen={onOpen}
      classes={{ paper: 'w-72' }}
    >
      <div className='flex items-center flex-end py-2 px-2 bg-primary shadow-xs'>
        <IconButton onClick={onClose}>
          <ChevronLeftIcon htmlColor='#fff' />
        </IconButton>
      </div>
      {user && (
        <div className='flex items-center mx-4 mt-2 mb-1'>
          <PersonIcon/>
          <h1 className='flex-auto text-xl font-semibold my-3'>
            {user?.username || ''}
          </h1>
        </div>
      )}
      {/*<List disablePadding>*/}
      {/*  <ListItem button key={'Account Settings'} onClick={onSettingsClick}>*/}
      {/*    <ListItemIcon>*/}
      {/*      <SettingsIcon />*/}
      {/*    </ListItemIcon>*/}
      {/*    <ListItemText primary={'Account Settings'} />*/}
      {/*  </ListItem>*/}
      {/*</List>*/}
      <List disablePadding>
        {/*<ListItem*/}
        {/*  button*/}
        {/*  key={'Bug Report or Feedback'}*/}
        {/*  onClick={onFeedbackClick}*/}
        {/*>*/}
        {/*  <ListItemIcon>*/}
        {/*    <BugReportIcon />*/}
        {/*  </ListItemIcon>*/}
        {/*  <ListItemText primary={'Bug Report or Feedback'} />*/}
        {/*</ListItem>*/}
        
        {            
          <ListItem button key={'createNewOlCheck'} onClick={createNewOlCheck}>
            <ListItemIcon>
              <CreateNewFolder />
            </ListItemIcon>
            <ListItemText primary={translate('prompts.createNewOlCheck')} />
          </ListItem>
        }
        {user ? ( // if logged in give logout option
          <>
            <ListItem button key={'UploadToDCS'} onClick={handleUpload}>
              <ListItemIcon>
                <CloudUploadIcon />
              </ListItemIcon>
              <ListItemText primary={'UploadToDCS'} />
            </ListItem>
            <ListItem button key={'Logout'} onClick={onLogout}>
              <ListItemIcon>
                <LockOpenIcon />
              </ListItemIcon>
              <ListItemText primary={'Logout'} />
            </ListItem>
          </>
        )
        : // or if not logged in give login option
        (
          <ListItem button key={'Login'} onClick={onLogIn}>
            <ListItemIcon>
              <LockIcon />
            </ListItemIcon>
            <ListItemText primary={'Login'} />
          </ListItem>
        )}
        <ListItem
          button
          key={translate('menu.select_locale')}
          onClick={onSelectLocal}
        >
          <ListItemIcon>
            <TranslateIcon />
          </ListItemIcon>
          <ListItemText primary={translate('menu.select_locale')} />
        </ListItem>

        <ListItem
          button
          key={translate('menu.open_translation_notes')}
          onClick={() => openCheckingFile(true)}
        >
          <ListItemIcon>
            <LaunchIcon />
          </ListItemIcon>
          <ListItemText primary={translate('menu.open_translation_notes')} />
        </ListItem>

        <ListItem
          button
          key={translate('menu.open_translation_words')}
          onClick={() => openCheckingFile(false)}
        >
          <ListItemIcon>
            <LaunchIcon />
          </ListItemIcon>
          <ListItemText primary={translate('menu.open_translation_words')} />
        </ListItem>
        
        {/*{user ? ( // if logged in give logout option*/}
        {/*  <ListItem button key={'Logout'} onClick={onLogout}>*/}
        {/*    <ListItemIcon>*/}
        {/*      <ExitToAppIcon />*/}
        {/*    </ListItemIcon>*/}
        {/*    <ListItemText primary={'Logout'} />*/}
        {/*  </ListItem>*/}
        {/*)*/}
        {/*: // or if logged in give login option*/}
        {/*(*/}
        {/*  <ListItem button key={'Login'} onClick={onLogIn}>*/}
        {/*    <ListItemIcon>*/}
        {/*      <ExitToAppIcon />*/}
        {/*    </ListItemIcon>*/}
        {/*    <ListItemText primary={'Login'} />*/}
        {/*  </ListItem>*/}
        {/*)}*/}
      </List>
    </SwipeableDrawer>
  )
}

CommandDrawer.propTypes = {
  open: PropTypes.bool,
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
  resetResourceLayout: PropTypes.func,
  checkUnsavedChanges: PropTypes.func,
  showFeedback: PropTypes.func,
  languages: PropTypes.object,
  currentLanguageSelection: PropTypes.string,
  translate: PropTypes.func
}
