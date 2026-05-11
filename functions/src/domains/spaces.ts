import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import {
  createUserSpace as createUserSpaceRaw,
  updateUserSpace as updateUserSpaceRaw,
} from "../spaces/userSpaceMutations";

export const createUserSpace = wrapCallableV2("createUserSpace", createUserSpaceRaw);
export const updateUserSpace = wrapCallableV2("updateUserSpace", updateUserSpaceRaw);
