import { PadButton } from './PadButton.jsx';
import { CMD, CMD_GLYPH } from '../../services/protocol.js';

export function DirectionPad({ disabled }) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-3 aspect-square w-full max-w-[min(92vw,460px)] mx-auto">
      <div /> {/* tl */}
      <PadButton cmd={CMD.F} glyph={CMD_GLYPH.F} variant="dir"  disabled={disabled} />
      <div /> {/* tr */}

      <PadButton cmd={CMD.L} glyph={CMD_GLYPH.L} variant="dir"  disabled={disabled} />
      <PadButton cmd={CMD.S} glyph={CMD_GLYPH.S} variant="stop" disabled={disabled} className="text-base" />
      <PadButton cmd={CMD.R} glyph={CMD_GLYPH.R} variant="dir"  disabled={disabled} />

      <div /> {/* bl */}
      <PadButton cmd={CMD.B} glyph={CMD_GLYPH.B} variant="dir"  disabled={disabled} />
      <div /> {/* br */}
    </div>
  );
}
export default DirectionPad;
