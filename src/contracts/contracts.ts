import { v1Auctions } from "./v1/auctions.contract";
import { v1Auth } from "./v1/auth.contract";
import { v1FeatureFlags } from "./v1/featureFlags.contract";
import { v1HealthCheck } from "./v1/healthCheck.contract";
import { v1Users } from "./v1/users.contract";

export const contracts = {
  v1: {
    auctions: v1Auctions,
    auth: v1Auth,
    featureFlags: v1FeatureFlags,
    healthCheck: v1HealthCheck,
    users: v1Users
  }
};
