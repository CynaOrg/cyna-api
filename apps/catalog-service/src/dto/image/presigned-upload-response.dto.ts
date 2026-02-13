export class PresignedUploadResponseDto {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresAt: Date;
}
