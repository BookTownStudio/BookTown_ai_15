import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { getHomeDiscoveryConsole as getHomeDiscoveryConsoleRaw } from "../home/getHomeDiscoveryConsole";
import { selectHomeContinuityBook as selectHomeContinuityBookRaw } from "../home/selectHomeContinuityBook";

export const getHomeDiscoveryConsole = wrapCallableV2(
  "getHomeDiscoveryConsole",
  getHomeDiscoveryConsoleRaw
);

export const selectHomeContinuityBook = wrapCallableV2(
  "selectHomeContinuityBook",
  selectHomeContinuityBookRaw
);
