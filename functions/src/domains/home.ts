import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { getHomeDiscoveryConsole as getHomeDiscoveryConsoleRaw } from "../home/getHomeDiscoveryConsole";

export const getHomeDiscoveryConsole = wrapCallableV2(
  "getHomeDiscoveryConsole",
  getHomeDiscoveryConsoleRaw
);
