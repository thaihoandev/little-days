import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { videoDurationFrames } from '../domain/video.js';
import { Recap, type RecapProps } from './Recap.js';
import { createAlbumContent } from '../domain/index.js';
const defaults: RecapProps = {
  album: {
    ...createAlbumContent(),
    id: 'preview',
    revision: 0,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
    assets: [],
  },
  config: {
    seconds: 30,
    pageIds: [],
    opening: 'Ngày mình bên nhau',
    closing: 'Và những ngày thật đẹp phía trước…',
    musicId: 'none',
  },
  referenceDate: '2026-10-28',
  assetData: {},
};
function Root() {
  return (
    <Composition
      id="CoupleRecap"
      component={Recap}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaults}
      calculateMetadata={({ props }) => ({ durationInFrames: videoDurationFrames(props.config) })}
    />
  );
}
registerRoot(Root);
