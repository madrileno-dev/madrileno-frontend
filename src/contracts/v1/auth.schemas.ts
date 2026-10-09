import { z } from "zod";

export const authWithEmailRequestSchema = z.object({
        "email": z.string()});
export type AuthWithEmailRequest = z.infer<typeof authWithEmailRequestSchema>;

export const authWithFirebaseRequestSchema = z.object({
        "firebaseJwtToken": z.string()});
export type AuthWithFirebaseRequest = z.infer<typeof authWithFirebaseRequestSchema>;

export const authWithOidcRequestSchema = z.object({
        "idToken": z.string()});
export type AuthWithOidcRequest = z.infer<typeof authWithOidcRequestSchema>;

export const authWithRefreshTokenRequestSchema = z.object({
        "refreshToken": z.string()});
export type AuthWithRefreshTokenRequest = z.infer<typeof authWithRefreshTokenRequestSchema>;

export const authenticatedResponseSchema = z.object({
        "jwt": z.string(),
        "refreshToken": z.string(),
        "userCreated": z.boolean()});
export type AuthenticatedResponse = z.infer<typeof authenticatedResponseSchema>;

export const logoutRequestSchema = z.object({
        "refreshToken": z.string()});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const sessionDtoSchema = z.object({
        "createdAt": z.iso.datetime({ offset: true }),
        "expiresAt": z.iso.datetime({ offset: true }),
        "id": z.uuid(),
        "ipAddress": z.string(),
        "refreshedAt": z.iso.datetime({ offset: true }),
        "userAgent": z.string()});
export type SessionDto = z.infer<typeof sessionDtoSchema>;
