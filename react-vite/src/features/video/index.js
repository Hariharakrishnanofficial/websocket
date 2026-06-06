/**
 * Video feature — public surface.
 *
 * The MJPEG-over-WS viewer + its dedicated Zustand store. Nothing else in
 * the app should reach into this folder beyond the exports below.
 */
export { default as VideoStream } from './VideoStream.jsx';
export { useVideoStore }          from './store.js';
