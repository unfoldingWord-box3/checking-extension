import React from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';

export default function CustomDialog({ onClose, title, open, isLoading = false, content = "", closeButtonStr = null, otherButtonStr = null, closeCallback = null }) {

  function _onClose(buttonStr) {
    closeCallback && closeCallback(buttonStr)
    onClose()
  }

  return (
    <Dialog open={open} onClose={() => _onClose()} aria-labelledby="form-dialog-title">
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {content}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => _onClose(closeButtonStr)} color="primary" disabled={isLoading}>
          {closeButtonStr || 'Accept'}
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
