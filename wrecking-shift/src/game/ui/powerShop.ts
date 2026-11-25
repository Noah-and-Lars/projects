import type { Progress } from '../progress';
import { TOOL_NAMES } from '../progress';
import type { ToolBelt } from '../../sim/tools/tool';
import { esc, money } from './dom';

/**
 * "Power upgrades" table of the workshop (shop) menu: one row per upgrade with level pips, what you have now,
 * what the next level gives, and a buy button (`data-act="buypow"`, handled in menus.ts).
 */
export function powerShopHtml(p: Progress, belt: ToolBelt | null | undefined): string {
  const score = p.totalScore();
  let rows = '';
  for (const u of p.powerDefs()) {
    const tool = TOOL_NAMES[u.tool] ?? belt?.byId(u.tool)?.name ?? u.tool;
    const lvl = p.powerLevel(u.id);
    const cost = p.nextPowerCost(u.id);
    const unlocked = p.isToolUnlocked(u.tool, score);
    const pips = u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const now = u.steps[lvl] ?? '';
    const next = cost != null ? u.steps[lvl + 1] ?? '' : '';
    let action: string;
    if (!unlocked) action = `<span class="lk">🔒 ${esc(p.toolRank(u.tool)?.name ?? '')}</span>`;
    else if (cost == null) action = '<span class="lk">Maxed</span>';
    else action = `<button class="ws-btn sm${p.cash >= cost ? ' pri' : ''}" data-act="buypow" data-id="${esc(u.id)}"${p.cash >= cost ? '' : ' disabled'}>${money(cost)}</button>`;
    rows += `<tr data-power="${esc(u.id)}"><td><b>${esc(tool)}</b><br><span class="lk">${esc(u.title)}</span></td><td><span class="ws-pips">${pips}</span></td>` +
      `<td>${esc(now)}${next ? ` <span class="lk">→ ${esc(next)}</span>` : ''}</td><td class="r">${action}</td></tr>`;
  }
  return `<div class="ws-sec" style="margin-top:.8em">Power upgrades</div><table class="ws-shop ws-power"><tr><th>Tool</th><th>Level</th><th>Now → next</th><th class="r">Next</th></tr>${rows}</table>`;
}
