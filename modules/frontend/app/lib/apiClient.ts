// API client for Compliance Analysis API

const API_BASE_URL = 'http://localhost:3030';

export type UserMode = 'user' | 'reviewer';

export interface ComplianceScore {
  overall_score: number;
  risk_level: string;
  flags: string[];
}

export interface Analysis {
  id: string;
  text: string;
  score: ComplianceScore;
  status: 'pending_review' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
}

export interface AnalysisResponse {
  id: string;
  status: string;
  score: ComplianceScore;
  created_at: string;
  message: string;
}

export interface ReviewDecisionResponse {
  id: string;
  status: string;
  reviewed_at: string;
  message: string;
}

export interface Statistics {
  total_analyses: number;
  pending_review: number;
  approved: number;
  rejected: number;
  average_score: number;
  mode: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    mode: UserMode,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Mode': mode,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // User endpoints
  async submitAnalysis(text: string): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>('/analyze', 'user', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async getAnalysis(id: string): Promise<Analysis> {
    return this.request<Analysis>(`/analysis/${id}`, 'user');
  }

  // Reviewer endpoints
  async getPendingReviews(): Promise<Analysis[]> {
    return this.request<Analysis[]>('/reviews/pending', 'reviewer');
  }

  async submitDecision(
    analysisId: string,
    decision: 'approve' | 'reject',
    notes?: string
  ): Promise<ReviewDecisionResponse> {
    return this.request<ReviewDecisionResponse>(
      `/reviews/${analysisId}/decision`,
      'reviewer',
      {
        method: 'POST',
        body: JSON.stringify({ decision, notes }),
      }
    );
  }

  async getAllReviews(status?: string): Promise<Analysis[]> {
    const queryParam = status ? `?status=${status}` : '';
    return this.request<Analysis[]>(`/reviews/all${queryParam}`, 'reviewer');
  }

  // Statistics (available to both modes)
  async getStatistics(mode: UserMode): Promise<Statistics> {
    return this.request<Statistics>('/stats', mode);
  }

  // Health check (no mode required)
  async healthCheck(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}

export const apiClient = new ApiClient();
