import { Sledge } from './sledge';
import { ToolBelt, type Tool } from './tool';

/** Full tool set in HUD order. New tools: add the class file and list it here. */
export function createTools(): Tool[] {
  return [new Sledge()];
}
export function createBelt(): ToolBelt {
  return new ToolBelt(createTools());
}
export * from './tool';
