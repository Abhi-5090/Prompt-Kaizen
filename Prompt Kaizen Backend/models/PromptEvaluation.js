const mongoose = require('mongoose');

const scoresSchema = new mongoose.Schema(
  {
    clarity: { type: Number, default: 0 },
    context: { type: Number, default: 0 },
    roleAssignment: { type: Number, default: 0 },
    taskDefinition: { type: Number, default: 0 },
    inputParameters: { type: Number, default: 0 },
    outputFormat: { type: Number, default: 0 },
    constraints: { type: Number, default: 0 },
    tone: { type: Number, default: 0 },
    relevance: { type: Number, default: 0 },
    grammarStructure: { type: Number, default: 0 },
  },
  { _id: false }
);

const promptEvaluationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    scenario: { type: String, required: true },
    userPrompt: { type: String, required: true },
    tone: { type: String, default: '' },
    targetAudience: { type: String, default: '' },
    additionalRequirements: { type: String, default: '' },
    scores: { type: scoresSchema, default: () => ({}) },
    overallScore: { type: Number, default: 0 },
    rating: { type: String, default: '' },
    missingParameters: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    suggestions: { type: [String], default: [] },
    improvedPrompt: { type: String, default: '' },

    // Which engine produced this score. Evaluations are compared over time on
    // the dashboard, so a run scored by the rule-based fallback during an LLM
    // outage must be distinguishable from an LLM-scored one rather than
    // silently mixed into the same trend line.
    scoredBy:     { type: String, enum: ['rules', 'llm'], default: 'rules', index: true },
    scoringModel: { type: String, default: null },

    // Marks an evaluation submitted as part of the Daily Challenge flow.
    isDailyChallenge: { type: Boolean, default: false, index: true },
    challengeDate:    { type: Date,    default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// Covers user-scoped dashboard/history queries that filter by userId and
// sort/filter by createdAt — the most common hot path on this collection.
promptEvaluationSchema.index({ userId: 1, createdAt: -1 });

// Covers admin "recent prompts" sort and any other global recency query.
promptEvaluationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PromptEvaluation', promptEvaluationSchema);
