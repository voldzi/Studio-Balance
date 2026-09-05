export type StudioImage = { src: string; alt: string; width: number; height: number };

// Fixed SQL aliases only. Never interpolate request values into this fragment.
export const instructorPortraitSql = `CASE
  WHEN i.portrait_asset_id IS NOT NULL THEN (
    SELECT jsonb_build_object('src', '/api/v1/media/' || ma.id, 'alt', i.display_name,
      'width', ma.width, 'height', ma.height) FROM media_assets ma WHERE ma.id=i.portrait_asset_id
  )
  WHEN i.portrait_preview_path <> '' THEN jsonb_build_object(
    'src', i.portrait_preview_path, 'alt', i.display_name, 'width', 1024, 'height', 1536)
  ELSE NULL END`;

export const teamPhotoSql = `CASE
  WHEN t.photo_asset_id IS NOT NULL THEN (
    SELECT jsonb_build_object('src', '/api/v1/media/' || ma.id, 'alt', t.photo_alt,
      'width', ma.width, 'height', ma.height) FROM media_assets ma WHERE ma.id=t.photo_asset_id
  )
  WHEN t.photo_preview_path <> '' THEN jsonb_build_object(
    'src', t.photo_preview_path, 'alt', t.photo_alt, 'width', 1024, 'height', 1535)
  ELSE NULL END`;
