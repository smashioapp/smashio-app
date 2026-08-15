import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Host flow plan (docs/host-flow-plan.md) §Backend changes, ai-proxy: "Client downscales to
// ~1600px long edge before upload (today it only sets quality: 0.8), which cuts both upload
// time and image tokens." Parsing now costs real money per call, so the client-side cost lever
// is worth pulling even though the server would still work on a full-resolution photo.
const MAX_LONG_EDGE = 1600;

// Resizes to fit within MAX_LONG_EDGE (never upscales — scale is clamped to 1) and re-compresses
// to JPEG @ 0.8, matching the quality the picker already asked for. width/height come straight
// from the ImagePicker asset, so no extra image load is needed to know the long edge.
export async function prepareConfirmationImage(uri: string, width: number, height: number): Promise<string> {
  const longEdge = Math.max(width, height);
  const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
  const context = ImageManipulator.manipulate(uri);
  if (scale < 1) {
    context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return result.uri;
}
