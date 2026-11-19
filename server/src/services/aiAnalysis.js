import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { CIVIC_CATEGORIES, departmentForCategory } from './civic.js';

const responseSchema = z.object({
  category: z.enum(CIVIC_CATEGORIES),
  severity: z.enum(['Low', 'Medium', 'High']),
  severityExplanation: z.string().trim().min(8).max(400),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(15).max(2000)
});

const categoryRules = [
  ['Pothole', /\b(potholes?|craters?|broken asphalt|damaged road|road surface)\b/i],
  ['Streetlight', /\b(street ?lights?|lamp ?posts?|light(?:s)? (?:is|are) out|dark stretch)\b/i],
  ['Water Leak', /\b(water leaks?|leaking pipe|burst pipe|water main|water flowing|public tap)\b/i],
  ['Garbage', /\b(garbage|rubbish|litter|waste collection|overflowing bins?|trash)\b/i],
  ['Drainage', /\b(drains?|drainage|flooding|water pooling|blocked runoff|storm ?water)\b/i]
];

function ruleBasedCategory(description) {
  return categoryRules.find(([, pattern]) => pattern.test(description))?.[0] || 'Other';
}

function ruleBasedSeverity(description) {
  if (/\b(deep|large|open drain|exposed wire|electrocution|traffic|injur(?:y|ies)|accident|flood(?:ing)?)\b/i.test(description)) {
    return {
      severity: 'High',
      severityExplanation: 'The description mentions damage or a condition that may create an immediate public safety risk.'
    };
  }
  if (/\b(?:unsafe|not\s+safe|dangerous|safety (?:concern|risk))\b/i.test(description)) {
    return {
      severity: 'Medium',
      severityExplanation: 'The description raises a safety concern, but does not identify an immediate hazard; an on-site inspection can assess the risk.'
    };
  }
  if (/\b(blocked|overflow(?:ing)?|leak(?:ing)?|broken|dark|unsafe|near (?:a )?(?:school|crossing|road))\b/i.test(description)) {
    return {
      severity: 'Medium',
      severityExplanation: 'The description indicates an ongoing civic issue that may disrupt residents or become a safety concern.'
    };
  }
  return {
    severity: 'Low',
    severityExplanation: 'The description does not mention an immediate safety hazard; an on-site inspection can confirm the impact.'
  };
}

function complaintFromDescription(description, category) {
  const text = description.trim().replace(/\s+/g, ' ');
  if (!text) return `Please inspect the reported ${category.toLowerCase()} issue and determine the appropriate corrective action.`;
  if (/\broads?\b/i.test(text) && /\b(?:unsafe|not\s+safe|dangerous|safety (?:concern|risk))\b/i.test(text)) {
    return 'Please inspect the roads and address the reported safety concern.';
  }
  const sentence = /^[A-Z]/.test(text) ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
  return `${sentence.replace(/[.!?]+$/, '')}. Please inspect and address this issue.`;
}

function ruleBasedResult(description, warning) {
  const category = ruleBasedCategory(description);
  const { severity, severityExplanation } = ruleBasedSeverity(description);
  const text = complaintFromDescription(description, category);
  return {
    category,
    severity,
    severityExplanation: `${severityExplanation} This is a rule-based estimate; the image was not analyzed by Gemini.`,
    title: `${category} issue report`,
    description: text.slice(0, 2000),
    suggestedDepartment: departmentForCategory(category)?.name || null,
    analysisMode: 'rule-based',
    warning
  };
}

export function parseGeminiAnalysis(text) {
  try {
    const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const result = responseSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function providerWarning(error) {
  const status = Number(error?.status ?? error?.code);
  if (status === 429) {
    return 'Gemini rate limit reached; text-based rule suggestions are shown instead.';
  }
  if (status === 401 || status === 403) {
    return 'Gemini rejected the API key or its permissions; check that the key is active and Gemini API access is enabled. Text-based rule suggestions are shown instead.';
  }
  if (status === 404) {
    return 'The configured Gemini model was not found; check GEMINI_MODEL. Text-based rule suggestions are shown instead.';
  }
  return 'Gemini analysis was unavailable; text-based rule suggestions are shown instead.';
}

export async function analyzeCivicIssue({ description, image }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return ruleBasedResult(
      description,
      'Gemini is not configured; text-based rule suggestions are shown and the image was not analyzed.'
    );
  }
  if (image?.mimeType === 'image/svg+xml') {
    return ruleBasedResult(
      description,
      'Gemini cannot analyze SVG uploads; text-based rule suggestions are shown and the image was not analyzed.'
    );
  }

  const prompt = `Analyze this civic issue report. Use the image when provided and the citizen description as context.
Return only a JSON object with exactly these fields:
{"category":"Pothole|Streetlight|Water Leak|Garbage|Drainage|Other","severity":"Low|Medium|High","severityExplanation":"short reason","title":"clear report title","description":"clear complaint, grounded only in supplied evidence"}
Choose one exact category and severity value. Do not invent a location or facts not visible or stated. Keep title under 120 characters and description between 15 and 2000 characters.
Citizen description: ${description || '(No text description provided.)'}`;
  const parts = [{ text: prompt }];
  if (image) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.buffer.toString('base64')
      }
    });
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json' }
    });
    const result = parseGeminiAnalysis(response.text || '');
    if (!result) {
      return ruleBasedResult(description, 'Gemini returned an invalid response; text-based rule suggestions are shown instead.');
    }
    return {
      ...result,
      suggestedDepartment: departmentForCategory(result.category)?.name || null,
      analysisMode: 'gemini',
      warning: null
    };
  } catch (error) {
    console.warn('Gemini issue analysis failed; using rule-based suggestions.', error?.message || error);
    return ruleBasedResult(description, providerWarning(error));
  }
}
