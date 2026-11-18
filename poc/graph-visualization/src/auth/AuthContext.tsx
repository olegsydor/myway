import { useContext } from "react";
import { AccountContext } from "./accountContext";
export function AccountButton() {
  const { openAccount } = useContext(AccountContext);
  return <button type="button" className="account-button" onClick={openAccount}>Account</button>;
}
