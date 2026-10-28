// UV multiplier (around the view centre) so an image covers a view without stretching.
export function coverScale(viewW, viewH, imgW, imgH) {
  const viewAspect = viewW / viewH;
  const imgAspect = imgW / imgH;
  return viewAspect > imgAspect ? [1, imgAspect / viewAspect] : [viewAspect / imgAspect, 1];
}
