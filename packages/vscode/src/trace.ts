/**
 * Where the time went, when somebody needs to know.
 *
 * Written because a freeze was reported that could not be reproduced, and the honest answer
 * to "what should I look at" was a list of four places to hunt by hand. A report that says
 * *compile 8ms, html 4ms, assign 1400ms* answers it in one line; four places to hunt does
 * not.
 *
 * Off by default and costing nothing when off: the timer is only read once a span ends, and
 * a span that nobody is recording does not create a channel.
 */

import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

/** Whether the author has asked for this. Read per call, so switching it on takes effect. */
function enabled(): boolean {
  return vscode.workspace.getConfiguration('kumihimo').get<boolean>('trace', false);
}

/**
 * Time one step and write it down.
 *
 * The step runs whether or not anybody is watching — this is a measurement, never a guard.
 *
 * @param label - What is being timed, e.g. `render:compile`.
 * @param step - The work.
 * @returns Whatever the work returned.
 */
export async function traced<T>(label: string, step: () => Promise<T> | T): Promise<T> {
  if (!enabled()) return step();

  const started = Date.now();
  try {
    return await step();
  } finally {
    write(`${label}  ${Date.now() - started} ms`);
  }
}

/** Note something that is not a duration — a state change worth seeing in order. */
export function note(message: string): void {
  if (enabled()) write(message);
}

function write(line: string): void {
  channel ??= vscode.window.createOutputChannel('kumihimo');
  // Wall-clock, because what matters is lining these up against the moment somebody
  // pressed save.
  channel.appendLine(`${new Date().toISOString().slice(11, 23)}  ${line}`);
}

/** Show the log, and turn it on if it is not already. */
export async function showTrace(): Promise<void> {
  const settings = vscode.workspace.getConfiguration('kumihimo');
  if (!settings.get<boolean>('trace', false)) {
    await settings.update('trace', true, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Tracing is on. Reproduce the problem, then copy this log.'),
    );
  }
  channel ??= vscode.window.createOutputChannel('kumihimo');
  channel.show(true);
}

/** Drop the channel when the extension goes. */
export function disposeTrace(): void {
  channel?.dispose();
  channel = undefined;
}
