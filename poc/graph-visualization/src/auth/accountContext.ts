import { createContext } from "react";
export const AccountContext = createContext<{ openAccount: () => void }>({ openAccount: () => {} });
