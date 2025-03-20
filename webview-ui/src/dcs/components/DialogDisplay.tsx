import React, { useContext } from "react";
// @ts-ignore
import CustomDialog from "./CustomDialog";
// @ts-ignore
import { CLOSE } from "../../common/constants";
// @ts-ignore
import { AuthenticationContext } from "gitea-react-toolkit/dist/components/authentication";

/**
 * Type definition for dialog content configuration
 */
interface DialogContentProps {
  message: string;
  closeButtonStr?: string;
  otherButtonStr?: string | null;
  closeCallback?: () => void;
  choices?: Array<any>; // Consider defining a more specific type for choices if possible
  showBusy?: boolean;
  doLogin?: boolean;
}

/**
 * Props for the DialogDisplay component
 */
interface DialogDisplayProps {
  /** Message to display above the dialog */
  message?: string;
  /** Dialog content configuration */
  dialogContent?: DialogContentProps;
  /** Function to clear dialog content */
  clearContent: () => void;
}

/**
 * A dialog component that displays messages and a dialog
 */
const DialogDisplay: React.FC<DialogDisplayProps> = (
  {
     message,
     dialogContent,
     clearContent
   }) => {

  const {
    // @ts-ignore
    component: authenticationComponent,
  } = useContext(AuthenticationContext)


  const doingLogin = dialogContent?.doLogin;
  const _content = doingLogin ? authenticationComponent : dialogContent?.message

  return (
    <>
      {message && <div>{message}</div>}
      {dialogContent?.message && (
        <CustomDialog
          open={true}
          content={_content}
          onClose={() => clearContent()}
          closeButtonStr={dialogContent.closeButtonStr || CLOSE}
          otherButtonStr={dialogContent.otherButtonStr || null}
          closeCallback={dialogContent.closeCallback}
          choices={dialogContent.choices}
          showBusy={dialogContent.showBusy}
        />
      )}
    </>
  );
};

export default DialogDisplay;