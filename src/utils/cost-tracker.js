/**
 * Cost Tracker Utility
 * Tracks API usage costs across OpenAI, ElevenLabs, and Rainforest APIs
 */

export class CostTracker {
  constructor(pricing = {}) {
    this.costs = {
      openai: 0,
      elevenlabs: 0,
      rainforest: 0,
      total: 0
    };

    this.pricing = {
      openai: {
        inputPerMillion: 2.50,
        outputPerMillion: 10.00,
        ...pricing.openai
      },
      elevenlabs: {
        perCharacter: 0.00003,
        ...pricing.elevenlabs
      },
      rainforest: {
        perRequest: 0.01,
        ...pricing.rainforest
      }
    };
  }

  trackOpenAI(usage) {
    const inputCost = (usage.prompt_tokens / 1000000) * this.pricing.openai.inputPerMillion;
    const outputCost = (usage.completion_tokens / 1000000) * this.pricing.openai.outputPerMillion;
    const cost = inputCost + outputCost;

    this.costs.openai += cost;
    this.costs.total += cost;
    return cost;
  }

  trackElevenLabs(characterCount) {
    const cost = characterCount * this.pricing.elevenlabs.perCharacter;
    this.costs.elevenlabs += cost;
    this.costs.total += cost;
    return cost;
  }

  trackRainforest() {
    const cost = this.pricing.rainforest.perRequest;
    this.costs.rainforest += cost;
    this.costs.total += cost;
    return cost;
  }

  getSummary() {
    return {
      openai: `$${this.costs.openai.toFixed(4)}`,
      elevenlabs: `$${this.costs.elevenlabs.toFixed(4)}`,
      rainforest: `$${this.costs.rainforest.toFixed(4)}`,
      total: `$${this.costs.total.toFixed(4)}`,
      breakdown: {
        openai: this.costs.openai,
        elevenlabs: this.costs.elevenlabs,
        rainforest: this.costs.rainforest,
        total: this.costs.total
      }
    };
  }

  reset() {
    this.costs = { openai: 0, elevenlabs: 0, rainforest: 0, total: 0 };
  }
}