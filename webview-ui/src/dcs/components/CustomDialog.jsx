import React from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import { MenuItem, Select } from "@material-ui/core";

export default function CustomDialog({ 
   onClose, title, open,
   isLoading = false,
   content = "",
   closeButtonStr = null,
   otherButtonStr = null,
   closeCallback = null,
   choices = null,
 }) {
  const ok_button = closeButtonStr || 'Accept';
  const [currentSelection, setCurrentSelection] = React.useState('');

  function _onClose(buttonStr) {
    let selection = buttonStr;
    if (choices) {
      if (buttonStr === ok_button) {
        selection = currentSelection;
      } else {
        selection = null
      }
    }
    closeCallback && closeCallback(selection)
    onClose()
  }

  function choiceCallback(event) {
    let selection = event?.target?.value || null
    setCurrentSelection(selection)
    console.log(`selected = ${selection}`)
  }

  return (
    <Dialog open={open} onClose={() => _onClose()} aria-labelledby="form-dialog-title">
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {content}
          {
            choices ?
              <Select
                labelId="prompt-selection-label"
                id="prompt-selection"
                value={currentSelection}
                onChange={choiceCallback}
              >
                {
                  choices?.map(item =>
                    <MenuItem value={item}>{item}</MenuItem>
                  )}
              </Select>
            : null  
          }
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => _onClose(closeButtonStr)} color="primary" disabled={isLoading}>
          {ok_button}
        </Button>
        { otherButtonStr &&
          <Button onClick={() => _onClose(otherButtonStr)} color="secondary" disabled={isLoading}>
            {otherButtonStr}
          </Button>
        }
      </DialogActions>
    </Dialog>
  );
}
