import React, { useContext } from "react";
// @ts-ignore
import CustomDialog from "./CustomDialog";
// @ts-ignore
import { CLOSE } from "../../common/constants";
// @ts-ignore
import { AuthenticationContext } from "gitea-react-toolkit/dist/components/authentication";

/**
 * Props:
 *  An object containing the configuration for the dialog, including:
 *    - doLogin: A boolean indicating if the dialog is tied to a login process.
 *    - closeButtonStr: A string to customize the text for the close button.
 *    - otherButtonStr: A string to customize the text for another optional button.
 *    - closeCallback: A function executed when the close button is clicked.
 *    - choices: An optional array of choices presented in the dialog.
 *    - showBusy: A boolean indicating if a loading state should be displayed within the dialog.
 * - clearContent: A function callback to clear the content or close the dialog.
 */
interface DialogContentProps {
  closeButtonStr?: string;
  otherButtonStr?: string | null;
  closeCallback?: () => void;
  choices?: Array<any>; // Consider defining a more specific type for choices if possible
  showBusy?: boolean;
  doLogin?: boolean;
}

/**
 * Props:
 * - dialogContent: An object containing the configuration for the dialog, including:
 *    - doLogin: A boolean indicating if the dialog is tied to a login process.
 *    - message: A string representing the content message for the dialog.
 *    - closeButtonStr: A string to customize the text for the close button.
 *    - otherButtonStr: A string to customize the text for another optional button.
 *    - closeCallback: A function executed when the close button is clicked.
 *    - choices: An optional array of choices presented in the dialog.
 *    - showBusy: A boolean indicating if a loading state should be displayed within the dialog.
 */
interface DialogDisplayProps {
  /** Message to display above the dialog */
  message?: string;
  open: boolean
  /** Dialog content configuration */
  dialogContent?: DialogContentProps;
  /** Function to clear dialog content */
  clearContent: () => void;
}

/**
 * DialogDisplay is a React functional component that renders a dialog,
 * conditionally displaying a message and custom dialog content.
 * If doLogin is true It displays the authentication component.
 *
 * Props:
 * - dialogContent: An object containing the configuration for the dialog, including:
 *    - doLogin: A boolean indicating if the dialog is tied to a login process.
 *    - message: A string representing the content message for the dialog.
 *    - closeButtonStr: A string to customize the text for the close button.
 *    - otherButtonStr: A string to customize the text for another optional button.
 *    - closeCallback: A function executed when the close button is clicked.
 *    - choices: An optional array of choices presented in the dialog.
 *    - showBusy: A boolean indicating if a loading state should be displayed within the dialog.
 * - clearContent: A function callback to clear the content or close the dialog.
 *
 * Contexts:
 * - AuthenticationContext: Provides the authenticationComponent to be used as dialog content
 *   during a login process.
 *
 * Returns:
 * - A React Fragment containing an optional message div and the CustomDialog component,
 *   rendered conditionally based on the provided props.
 */
const DialogDisplay: React.FC<DialogDisplayProps> = (
  {
    clearContent,
    dialogContent,
    open
   }) => {

  const {
    // @ts-ignore
    component: authenticationComponent,
  } = useContext(AuthenticationContext)
  
  const doingLogin = dialogContent?.doLogin;
  const _content = doingLogin ? authenticationComponent : dialogContent?.message

  return (
    <>
      <CustomDialog
        open={open}
        content={_content}
        onClose={() => clearContent()}
        closeButtonStr={dialogContent?.closeButtonStr || CLOSE}
        otherButtonStr={dialogContent?.otherButtonStr || null}
        closeCallback={dialogContent?.closeCallback}
        choices={dialogContent?.choices}
        showBusy={dialogContent?.showBusy}
      />
    </>
  );
};

export default DialogDisplay;