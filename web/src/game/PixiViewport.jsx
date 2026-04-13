// PixiViewport — React wrapper around pixi-viewport for pan/zoom/pinch.
//
// Adapted from ai-town's PixiViewport.tsx (Apache 2.0). The critical
// pattern is: the parent must pass `app` as a prop (obtained from
// useApp() in a sibling component INSIDE <Stage>), not try to read it
// inside the PixiComponent create() function.

import { PixiComponent } from "@pixi/react";
import { Viewport } from "pixi-viewport";

export default PixiComponent("Viewport", {
  create(props) {
    const { app, children, viewportRef, ...viewportProps } = props;
    const viewport = new Viewport({
      events: app.renderer.events,
      passiveWheel: false,
      ...viewportProps,
    });
    if (viewportRef) {
      viewportRef.current = viewport;
    }
    viewport
      .drag()
      .pinch({})
      .wheel()
      .decelerate()
      .clamp({ direction: "all", underflow: "center" })
      .clampZoom({
        minScale: 0.4,
        maxScale: 3.0,
      });
    return viewport;
  },
  applyProps(viewport, oldProps, newProps) {
    Object.keys(newProps).forEach((p) => {
      if (
        p !== "app" &&
        p !== "viewportRef" &&
        p !== "children" &&
        oldProps[p] !== newProps[p]
      ) {
        // @ts-expect-error dynamic prop pass-through
        viewport[p] = newProps[p];
      }
    });
  },
});
