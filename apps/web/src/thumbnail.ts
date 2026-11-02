let supported = false;
export function configureThumbnails(enabled: boolean) {
  supported = enabled;
}
export function thumbnailUrl(url: string) {
  return supported && /^\/api\/(albums|journal)\/[\w-]+\/assets\/[\w-]+$/.test(url)
    ? url + '?thumbnail=1'
    : url;
}
