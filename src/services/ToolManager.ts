import { ToolCallExecution, AuraMood } from '../types/assistant';

export interface ToolHandler {
  execute: (args: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;
}

export interface ToolManagerOptions {
  onToolExecution?: (execution: ToolCallExecution) => void;
  onAuraMoodChange?: (mood: AuraMood) => void;
}

export class ToolManager {
  private tools: Map<string, ToolHandler> = new Map();
  private options: ToolManagerOptions;

  constructor(options: ToolManagerOptions = {}) {
    this.options = options;
    this.registerDefaultTools();
  }

  /**
   * Register a new tool handler
   */
  public registerTool(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  /**
   * Execute incoming function calls from Gemini Live
   */
  public async handleToolCall(call: {
    id?: string;
    name: string;
    args?: Record<string, any>;
  }): Promise<{ id?: string; name: string; response: Record<string, any> }> {
    const callId = call.id || `call_${Date.now()}`;
    const toolName = call.name;
    const args = call.args || {};

    const execution: ToolCallExecution = {
      id: callId,
      name: toolName,
      args,
      status: 'executing',
      timestamp: Date.now(),
    };

    if (this.options.onToolExecution) {
      this.options.onToolExecution(execution);
    }

    try {
      const handler = this.tools.get(toolName);
      if (!handler) {
        throw new Error(`Tool "${toolName}" is not registered on the client.`);
      }

      const result = await handler.execute(args);

      execution.status = 'success';
      execution.result = result;
      if (this.options.onToolExecution) {
        this.options.onToolExecution({ ...execution });
      }

      return {
        id: call.id,
        name: toolName,
        response: {
          output: result,
        },
      };
    } catch (err: any) {
      console.error(`[ToolManager] Execution failed for ${toolName}:`, err);

      execution.status = 'error';
      execution.result = { error: err?.message || String(err) };
      if (this.options.onToolExecution) {
        this.options.onToolExecution({ ...execution });
      }

      return {
        id: call.id,
        name: toolName,
        response: {
          error: err?.message || 'Execution error in client tool handler',
        },
      };
    }
  }

  private registerDefaultTools(): void {
    // Tool 1: openWebsite
    this.registerTool('openWebsite', {
      execute: (args) => {
        let rawUrl = (args.url || '').trim();
        if (!rawUrl) {
          throw new Error('URL parameter is required.');
        }

        if (!/^https?:\/\//i.test(rawUrl)) {
          rawUrl = `https://${rawUrl}`;
        }

        const label = args.label || rawUrl;

        // Attempt to open the link in a new tab
        const openedWindow = window.open(rawUrl, '_blank', 'noopener,noreferrer');
        const popupBlocked = !openedWindow || openedWindow.closed || typeof openedWindow.closed === 'undefined';

        return {
          status: 'opened',
          url: rawUrl,
          label,
          popupBlocked,
          message: popupBlocked
            ? `Browser popup policy prevented automatic opening. Link card presented to user: ${rawUrl}`
            : `Successfully opened ${label} in a new browser tab.`,
        };
      },
    });

    // Tool 2: getCurrentTime
    this.registerTool('getCurrentTime', {
      execute: (args) => {
        const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        const formattedDate = now.toLocaleDateString('en-US', {
          timeZone: timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return {
          currentTime: formattedTime,
          currentDate: formattedDate,
          timezone,
        };
      },
    });

    // Tool 3: changeAuraMood
    this.registerTool('changeAuraMood', {
      execute: (args) => {
        const rawMood = (args.mood || 'cyberpunk').toLowerCase();
        let targetMood: AuraMood = 'cyberpunk';

        if (['aurora', 'deep_space', 'sunset_blush', 'electric_violet'].includes(rawMood)) {
          targetMood = rawMood as AuraMood;
        }

        if (this.options.onAuraMoodChange) {
          this.options.onAuraMoodChange(targetMood);
        }

        return {
          success: true,
          auraMood: targetMood,
          message: `Atmosphere aura shifted to ${targetMood}. Interface glow updated.`,
        };
      },
    });
  }
}
