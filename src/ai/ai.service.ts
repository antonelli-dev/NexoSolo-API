import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { completeChat, type LlmProviderName } from './llm/complete-chat';
import type { BriefToScopeDto } from './dto/brief-to-scope.dto';
import type { FairnessCheckDto } from './dto/fairness-check.dto';
import type { PricingCoachDto } from './dto/pricing-coach.dto';
import type { BriefAmbiguityDto } from './dto/brief-ambiguity.dto';
import type { InvoiceChaseMessageDto } from './dto/invoice-chase-message.dto';
import type { RewriteScopeDto } from './dto/rewrite-scope.dto';
import type { ScopeRiskLineDto } from './dto/scope-risk-line.dto';

function parseJsonBlock(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return JSON');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  private parseModelJson(raw: string): Record<string, unknown> {
    try {
      return parseJsonBlock(raw);
    } catch {
      throw new ServiceUnavailableException({
        code: 'LLM_BAD_JSON',
        message: 'Model did not return valid JSON.',
      });
    }
  }

  private async runLlm(
    input: Parameters<typeof completeChat>[0],
  ): Promise<string> {
    try {
      return await completeChat(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException({
        code: 'LLM_ERROR',
        message: msg,
      });
    }
  }

  public llmConfig(): {
    provider: LlmProviderName;
    apiKey: string;
    baseUrl?: string;
    model?: string;
  } {
    const provider = (process.env.AI_PROVIDER ?? 'openai').trim() as LlmProviderName;
    const apiKey = process.env.AI_API_KEY?.trim() ?? '';
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        message:
          'Set AI_PROVIDER and AI_API_KEY in the API environment (e.g. openai or anthropic).',
      });
    }
    return {
      provider,
      apiKey,
      baseUrl: process.env.AI_BASE_URL?.trim() || undefined,
      model: process.env.AI_MODEL?.trim() || undefined,
    };
  }

  async pricingCoach(userId: string, dto: PricingCoachDto) {
    void userId;
    const cfg = this.llmConfig();
    const system = `You are a senior freelance business coach for copywriters and B2B content creators.
Respond ONLY with a single JSON object (no markdown) with keys:
summary (string, one sentence),
fairnessScore (number 0-100, how fair the price is vs described work),
verdict (string: "underpriced" | "fair" | "premium"),
suggestedRangeCents (object { min: number, max: number } in same currency as input),
reasons (string[] max 5),
negotiationTips (string[] max 4),
risksIfUnderpriced (string[] max 3).
Use the user's locale implicitly from currency; amounts in cents.`;

    const user = JSON.stringify({
      projectDescription: dto.projectDescription,
      deliverables: dto.deliverables ?? null,
      hoursWorked: dto.hoursWorked ?? null,
      hourlyRateCents: dto.hourlyRateCents ?? null,
      quotedAmountCents: dto.quotedAmountCents,
      currency: dto.currency,
      clientType: dto.clientType ?? null,
      urgency: dto.urgency ?? null,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });
    return this.parseModelJson(raw);
  }

  async briefToScope(userId: string, dto: BriefToScopeDto) {
    void userId;
    const cfg = this.llmConfig();
    const system = `You turn messy client briefs into clear scope for B2B copy/content work.
Respond ONLY with JSON (no markdown) keys:
title (string),
scopeBullets (string[]),
milestones (array of { name: string, daysFromStart: number }),
suggestedPriceCents (number),
priceRationale (string),
revisionPolicy (string),
questionsForClient (string[] max 5).`;

    const user = JSON.stringify({
      brief: dto.brief,
      scopeNotes: dto.scopeNotes ?? null,
      priceHint: dto.priceHint ?? null,
      currency: dto.currency ?? 'EUR',
    });

    const raw = await completeChat({
      ...cfg,
      system,
      user,
      maxTokens: 4096,
    });
    return this.parseModelJson(raw);
  }

  async fairnessCheck(userId: string, dto: FairnessCheckDto) {
    void userId;
    const cfg = this.llmConfig();
    const system = `You compare whether a freelancer charged appropriately for work already done or quoted.
Respond ONLY with JSON keys:
score (0-100),
verdict ("underpriced"|"fair"|"overpriced"),
explanation (string),
comparisonToMarket (string),
actionItems (string[] max 4).`;

    const user = JSON.stringify(dto);
    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });
    return this.parseModelJson(raw);
  }

  async weeklyDigest(userId: string) {
    const cfg = this.llmConfig();

    const [clientCount, projectCount, invoices] = await Promise.all([
      this.prisma.freelanceClient.count({ where: { userId } }),
      this.prisma.freelanceProject.count({ where: { userId } }),
      this.prisma.freelanceInvoice.findMany({
        where: { project: { userId } },
        include: { project: { include: { client: true } }, payments: true },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      }),
    ]);

    const balanceCents = (i: (typeof invoices)[number]): number => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      const bal = Number(i.amount) - paid;
      return Math.max(0, Math.round(bal * 100));
    };

    const pending = invoices.filter((i) =>
      ['sent', 'viewed'].includes(i.status),
    );
    const pendingCents = pending.reduce((s, i) => s + balanceCents(i), 0);

    const snapshot = {
      clientCount,
      projectCount,
      pendingInvoiceCount: pending.filter((i) => balanceCents(i) > 0).length,
      pendingCents,
      recentInvoices: invoices.slice(0, 10).map((i) => ({
        status: i.status,
        outstandingCents: balanceCents(i),
        currency: i.currency,
        client: i.project.client.name,
        project: i.project.name,
      })),
    };

    const system = `You write a concise weekly digest for a freelance copywriter using CRM data.
Respond ONLY with JSON keys:
headline (string),
priorities (string[] max 5),
cashflowNote (string),
followUps (string[] max 4),
mindset (string one short paragraph).`;

    const user = JSON.stringify(snapshot);

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });
    const parsed = this.parseModelJson(raw);
    return { snapshot, digest: parsed };
  }

  async invoiceChaseMessage(userId: string, dto: InvoiceChaseMessageDto) {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id: dto.invoiceId, project: { userId } },
      include: { project: { include: { client: true } }, payments: true },
    });
    if (!inv) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
    }

    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balanceCents = Math.max(
      0,
      Math.round((Number(inv.amount) - paid) * 100),
    );

    const cfg = this.llmConfig();
    const tone =
      dto.tone === 'firm'
        ? 'Firm but professional; clear deadline expectation.'
        : 'Warm and polite; assume good intent; still clear on what is owed.';

    const system = `You write short payment follow-up copy for a freelancer messaging a client (email or WhatsApp).
Rules:
- Do NOT include payment links, URLs, or instructions to pay online.
- Keep total body under ~900 characters unless the user context requires slightly more.
- Language: match the client's locale if obvious from names/context; otherwise English.
- Tone guidance: ${tone}
Respond ONLY with JSON keys:
subject (string, email subject line, max ~90 chars),
body (string, message body the freelancer can paste; no markdown).`;

    const user = JSON.stringify({
      invoiceNumber: inv.invoiceNumber ?? inv.id.slice(0, 8),
      clientName: inv.project.client.name,
      projectName: inv.project.name,
      amountCents: balanceCents,
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate?.toISOString() ?? null,
      memo: inv.memo ?? null,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 1024,
    });
    return this.parseModelJson(raw);
  }

  async briefAmbiguity(userId: string, dto: BriefAmbiguityDto) {
    void userId;
    const cfg = this.llmConfig();
    const system = `You spot vagueness in client briefs for freelance copywriting / B2B content work.
Respond ONLY with JSON keys:
ambiguousPoints (string[] max 5, each one short bullet — what is unclear or missing),
clarifyingQuestions (string[] max 4, concrete questions the freelancer should ask the client).
No markdown. Same language as the brief when possible.`;

    const user = JSON.stringify({
      brief: dto.brief,
      scopeNotes: dto.scopeNotes ?? null,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 1536,
    });
    return this.parseModelJson(raw);
  }

  async scopeRiskLine(userId: string, dto: ScopeRiskLineDto) {
    void userId;
    const cfg = this.llmConfig();
    const system = `You give ONE short line (max 220 characters) warning what in a written scope often causes extra work, rework, or disputes for freelance copy/content projects.
Tone: practical, not alarmist. No payment or billing advice.
Respond ONLY with JSON: { "riskLine": string }`;

    const user = JSON.stringify({
      scopeText: dto.scopeText,
      brief: dto.brief ?? null,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 512,
    });
    return this.parseModelJson(raw);
  }

  async rewriteScope(userId: string, dto: RewriteScopeDto) {
    void userId;
    const cfg = this.llmConfig();
    const modeHint =
      dto.mode === 'clearer'
        ? 'Make scope clearer and more testable; keep structure.'
        : dto.mode === 'tighter'
          ? 'Tighten scope; remove fluff; keep deliverables explicit.'
          : 'Rewrite in calm, client-friendly language; still precise.';

    const system = `You rewrite freelance project scope notes for copy/content work.
${modeHint}
Respond ONLY with JSON: { "rewritten": string } (plain text, can use short bullet lines; no markdown headings).`;

    const user = JSON.stringify({
      scopeText: dto.scopeText,
      mode: dto.mode,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });
    return this.parseModelJson(raw);
  }

  async chat(userId: string, dto: { messages: Array<{role: string, content: string}> }) {
    const cfg = this.llmConfig();
    const system = `You are an expert AI assistant for freelancers and solopreneurs. You help with business strategy, pricing, client communication, and project management. Keep answers concise, actionable, and professional.`;

    const history = dto.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const user = `Here is the conversation history:\n\n${history}\n\nPlease provide the next assistant response.`;

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });
    
    return { response: raw };
  }

  async analyzeDocument(userId: string, fileBuffer: Buffer, mimeType: string, filename: string) {
    const cfg = this.llmConfig();
    let extractedText = '';

    try {
      if (mimeType === 'application/pdf') {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(fileBuffer);
        extractedText = data.text;
      } else {
        extractedText = fileBuffer.toString('utf-8');
      }
    } catch (e) {
      throw new Error('Failed to parse document');
    }

    const system = `You are an expert business analyst. Analyze the provided document (e.g., a client brief, requirements doc, or contract).
Extract the key requirements and generate a step-by-step visual flow/plan for the project.
Respond ONLY with JSON keys:
summary (string, brief summary of the document),
requirements (string[]),
projectFlow (array of { step: number, title: string, description: string, estimatedDays: number }),
questionsForClient (string[]).`;

    const user = `Document Name: ${filename}\n\nDocument Content:\n${extractedText.slice(0, 15000)}`;

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 3000,
    });

    return this.parseModelJson(raw);
  }
}
