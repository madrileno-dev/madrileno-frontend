import { z } from "zod";

export const bidDtoSchema = z.object({
        "amount": z.number(),
        "auctionId": z.uuid(),
        "bidderId": z.uuid(),
        "createdAt": z.iso.datetime({ offset: true }),
        "id": z.uuid()});
export type BidDto = z.infer<typeof bidDtoSchema>;

export const bidHistoryEntryDtoSchema = z.object({
        "amount": z.number(),
        "bidderRef": z.string(),
        "createdAt": z.iso.datetime({ offset: true }),
        "currency": z.string(),
        "id": z.uuid()});
export type BidHistoryEntryDto = z.infer<typeof bidHistoryEntryDtoSchema>;

export const bidTooLowExtensionErrorSchema = z.object({
        "detail": z.string().describe("Human-readable explanation").nullish(),
        "instance": z.string().describe("URI reference identifying the specific occurrence").nullish(),
        "minAmount": z.number(),
        "status": z.number().int().describe("HTTP status code"),
        "title": z.string().describe("Short human-readable summary"),
        "type": z.string().describe("A URI reference identifying the problem type")}).describe("RFC 9457 Problem Details error response");
export type BidTooLowExtensionError = z.infer<typeof bidTooLowExtensionErrorSchema>;

export const commitUploadRequestSchema = z.object({
        "fileName": z.string(),
        "imageId": z.uuid()});
export type CommitUploadRequest = z.infer<typeof commitUploadRequestSchema>;

export const createAuctionRequestSchema = z.object({
        "appellation": z.string(),
        "bottleCount": z.number().int(),
        "bottleSize": z.enum(["DoubleMagnum","Half","Jeroboam","Magnum","Other","Standard"]),
        "color": z.enum(["Dessert","Fortified","Orange","Red","Rose","Sparkling","White"]),
        "currency": z.string(),
        "description": z.string().nullish(),
        "endsAt": z.iso.datetime({ offset: true }),
        "producerName": z.string(),
        "region": z.string(),
        "startingPrice": z.number(),
        "startsAt": z.iso.datetime({ offset: true }),
        "vintage": z.number().int().nullish(),
        "wineName": z.string()});
export type CreateAuctionRequest = z.infer<typeof createAuctionRequestSchema>;

export const placeBidRequestSchema = z.object({
        "amount": z.number()});
export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;

export const presignUploadRequestSchema = z.object({
        "contentLength": z.number().int(),
        "contentType": z.string()});
export type PresignUploadRequest = z.infer<typeof presignUploadRequestSchema>;

export const presignedUploadDtoSchema = z.object({
        "imageId": z.uuid(),
        "signedHeaders": z.record(z.string(), z.string()),
        "url": z.string()});
export type PresignedUploadDto = z.infer<typeof presignedUploadDtoSchema>;

export const reorderImagesRequestSchema = z.object({
        "orderedIds": z.array(z.uuid())});
export type ReorderImagesRequest = z.infer<typeof reorderImagesRequestSchema>;

export const variantDtoSchema = z.object({
        "format": z.string(),
        "height": z.number().int(),
        "spec": z.string(),
        "url": z.string(),
        "width": z.number().int()});
export type VariantDto = z.infer<typeof variantDtoSchema>;

export const vivinoRatingDtoSchema = z.object({
        "rating": z.number(),
        "ratingsCount": z.number().int()});
export type VivinoRatingDto = z.infer<typeof vivinoRatingDtoSchema>;

export const auctionDtoSchema = z.object({
        "appellation": z.string(),
        "bottleCount": z.number().int(),
        "bottleSize": z.enum(["DoubleMagnum","Half","Jeroboam","Magnum","Other","Standard"]),
        "color": z.enum(["Dessert","Fortified","Orange","Red","Rose","Sparkling","White"]),
        "currency": z.string(),
        "currentPrice": z.number(),
        "description": z.string().nullish(),
        "endsAt": z.iso.datetime({ offset: true }),
        "id": z.uuid(),
        "producerName": z.string(),
        "rating": vivinoRatingDtoSchema.nullish(),
        "region": z.string(),
        "sellerId": z.uuid(),
        "startingPrice": z.number(),
        "startsAt": z.iso.datetime({ offset: true }),
        "status": z.enum(["Cancelled","Closed","Open"]),
        "vintage": z.number().int().nullish(),
        "wineName": z.string()});
export type AuctionDto = z.infer<typeof auctionDtoSchema>;

export const auctionImageDtoSchema = z.object({
        "auctionId": z.uuid(),
        "contentType": z.string(),
        "fileName": z.string(),
        "height": z.number().int().nullish(),
        "id": z.uuid(),
        "position": z.number().int(),
        "sizeBytes": z.number().int(),
        "uploadedAt": z.iso.datetime({ offset: true }),
        "url": z.string(),
        "variants": z.array(variantDtoSchema),
        "width": z.number().int().nullish()});
export type AuctionImageDto = z.infer<typeof auctionImageDtoSchema>;

export const cursorSchema = z.object({
        "hasMore": z.boolean(),
        "items": z.array(bidHistoryEntryDtoSchema)});
export type Cursor = z.infer<typeof cursorSchema>;

export const pageSchema = z.object({
        "items": z.array(auctionDtoSchema),
        "limit": z.number().int(),
        "offset": z.number().int(),
        "total": z.number().int()});
export type Page = z.infer<typeof pageSchema>;
