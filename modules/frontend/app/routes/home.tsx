import { useState, useEffect } from "react";
import type { Route } from "./+types/home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { toast } from "sonner";
import { apiClient, type Analysis, type Statistics, type UserMode } from "~/lib/apiClient";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Compliance Analysis System" },
    { name: "description", content: "Text compliance analysis with human review workflow" },
  ];
}

export default function Home() {
  const [mode, setMode] = useState<UserMode>('user');
  const [textInput, setTextInput] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [pendingReviews, setPendingReviews] = useState<Analysis[]>([]);
  const [allReviews, setAllReviews] = useState<Analysis[]>([]);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [reviewNotes, setReviewNotes] = useState<{ [key: string]: string }>({});

  // Load stats when mode changes
  useEffect(() => {
    loadStats();
  }, [mode]);

  const loadStats = async () => {
    try {
      const data = await apiClient.getStatistics(mode);
      setStats(data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleSubmitAnalysis = async () => {
    if (!textInput.trim()) {
      toast.error('Please enter some text to analyze');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.submitAnalysis(textInput);
      toast.success('Analysis submitted successfully!');
      setAnalysisId(response.id);
      
      // Fetch the full analysis to get the title
      const fullAnalysis = await apiClient.getAnalysis(response.id);
      setResult(fullAnalysis);
      
      setTextInput('');
      loadStats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleGetAnalysis = async () => {
    if (!analysisId.trim()) {
      toast.error('Please enter an analysis ID');
      return;
    }

    setLoading(true);
    try {
      const data = await apiClient.getAnalysis(analysisId);
      setResult(data);
      toast.success('Analysis retrieved successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to retrieve analysis');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingReviews = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getPendingReviews();
      setPendingReviews(data);
      toast.success(`Loaded ${data.length} pending review(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load pending reviews');
    } finally {
      setLoading(false);
    }
  };

  const loadAllReviews = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getAllReviews();
      setAllReviews(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (analysisId: string, decision: 'approve' | 'reject') => {
    setLoading(true);
    try {
      const notes = reviewNotes[analysisId] || '';
      await apiClient.submitDecision(analysisId, decision, notes);
      toast.success(`Analysis ${decision}d successfully!`);
      setPendingReviews(prev => prev.filter(a => a.id !== analysisId));
      setReviewNotes(prev => {
        const updated = { ...prev };
        delete updated[analysisId];
        return updated;
      });
      loadStats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit decision');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'low':
        return 'bg-green-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'high':
        return 'bg-red-500';
      default:
        return 'bg-muted';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary">Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-green-600">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Compliance Analysis System</CardTitle>
            <CardDescription>Analyze text for compliance issues with human review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Current Mode:</span>
              <div className="flex gap-2">
                <Button
                  variant={mode === 'user' ? 'default' : 'outline'}
                  onClick={() => setMode('user')}
                >
                  User Mode
                </Button>
                <Button
                  variant={mode === 'reviewer' ? 'default' : 'outline'}
                  onClick={() => setMode('reviewer')}
                >
                  Reviewer Mode
                </Button>
              </div>
            </div>

            {/* Statistics */}
            {mode === 'reviewer' && stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{stats.total_analyses}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{stats.pending_review}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                  <div className="text-xs text-muted-foreground">Approved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                  <div className="text-xs text-muted-foreground">Rejected</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.average_score.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">Avg Score</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Mode Interface */}
        {mode === 'user' && (
          <Tabs defaultValue="submit" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="submit">Submit Analysis</TabsTrigger>
              <TabsTrigger value="retrieve">Retrieve Result</TabsTrigger>
            </TabsList>

            <TabsContent value="submit">
              <Card>
                <CardHeader>
                  <CardTitle>Submit Text for Analysis</CardTitle>
                  <CardDescription>
                    Enter text to analyze for compliance issues
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Enter text to analyze... (e.g., 'This document contains customer privacy data requiring GDPR compliance')"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <Button onClick={handleSubmitAnalysis} disabled={loading} className="w-full">
                    {loading ? 'Submitting...' : 'Submit for Analysis'}
                  </Button>
                  {analysisId && result && (
                    <div className="p-4 rounded-lg bg-muted space-y-2">
                      <div>
                        <p className="text-sm font-medium mb-1">Title:</p>
                        <p className="text-base font-semibold">{result.title}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Analysis ID (save this):</p>
                        <code className="text-sm font-mono break-all">{analysisId}</code>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="retrieve">
              <Card>
                <CardHeader>
                  <CardTitle>Retrieve Analysis Result</CardTitle>
                  <CardDescription>
                    Enter your analysis ID to check the status and results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter analysis ID"
                      value={analysisId}
                      onChange={(e) => setAnalysisId(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md bg-background"
                    />
                    <Button onClick={handleGetAnalysis} disabled={loading}>
                      {loading ? 'Loading...' : 'Retrieve'}
                    </Button>
                  </div>

                  {result && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Analysis Result</h3>
                        {getStatusBadge(result.status)}
                      </div>

                      <div className="grid gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Text</label>
                          <div className="mt-1 p-3 rounded-md bg-muted text-sm">
                            {result.text}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Score</label>
                            <div className="text-2xl font-bold">{result.score.overall_score}</div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Risk Level</label>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`w-3 h-3 rounded-full ${getRiskColor(result.score.risk_level)}`} />
                              <span className="font-medium capitalize">{result.score.risk_level}</span>
                            </div>
                          </div>
                        </div>

                        {result.score.flags.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Flags</label>
                            <ul className="mt-2 space-y-1">
                              {result.score.flags.map((flag, idx) => (
                                <li key={idx} className="text-sm flex items-start gap-2">
                                  <span className="text-destructive">•</span>
                                  <span>{flag}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {result.reviewer_notes && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Reviewer Notes</label>
                            <div className="mt-1 p-3 rounded-md bg-muted text-sm">
                              {result.reviewer_notes}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(result.created_at).toLocaleString()}
                          {result.reviewed_at && (
                            <> • Reviewed: {new Date(result.reviewed_at).toLocaleString()}</>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Reviewer Mode Interface */}
        {mode === 'reviewer' && (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending" onClick={loadPendingReviews}>
                Pending Reviews
              </TabsTrigger>
              <TabsTrigger value="all" onClick={loadAllReviews}>
                All Reviews
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Reviews</CardTitle>
                  <CardDescription>
                    Review and approve or reject pending analyses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingReviews.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pending reviews. Click the tab to refresh.
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-4">
                        {pendingReviews.map((analysis) => (
                          <Card key={analysis.id} className="border-2">
                            <CardContent className="pt-6 space-y-4">
                              <div className="flex items-start justify-between">
                                <div className=" space-y-1 flex-1">
                                  <h4 className="font-semibold text-lg">{analysis.title}</h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">ID:</span>
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                      {analysis.id.slice(0, 8)}...
                                    </code>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(analysis.created_at).toLocaleString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${getRiskColor(analysis.score.risk_level)}`} />
                                  <span className="text-xl font-bold">{analysis.score.overall_score}</span>
                                </div>
                              </div>

                              <Separator />

                              <div>
                                <label className="text-sm font-medium">Text</label>
                                <div className="mt-1 p-3 rounded-md bg-muted text-sm">
                                  {analysis.text}
                                </div>
                              </div>

                              {analysis.score.flags.length > 0 && (
                                <div>
                                  <label className="text-sm font-medium">Flags</label>
                                  <ul className="mt-1 space-y-1">
                                    {analysis.score.flags.map((flag, idx) => (
                                      <li key={idx} className="text-sm flex items-start gap-2">
                                        <span className="text-destructive">•</span>
                                        <span>{flag}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div>
                                <label className="text-sm font-medium">Reviewer Notes (optional)</label>
                                <Textarea
                                  placeholder="Add notes about your decision..."
                                  value={reviewNotes[analysis.id] || ''}
                                  onChange={(e) =>
                                    setReviewNotes((prev) => ({
                                      ...prev,
                                      [analysis.id]: e.target.value,
                                    }))
                                  }
                                  rows={2}
                                  className="mt-1"
                                />
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleDecision(analysis.id, 'approve')}
                                  disabled={loading}
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                  Approve
                                </Button>
                                <Button
                                  onClick={() => handleDecision(analysis.id, 'reject')}
                                  disabled={loading}
                                  variant="destructive"
                                  className="flex-1"
                                >
                                  Reject
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle>All Reviews</CardTitle>
                  <CardDescription>View all analyses and their status</CardDescription>
                </CardHeader>
                <CardContent>
                  {allReviews.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No reviews yet. Click the tab to load.
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-3">
                        {allReviews.map((analysis) => (
                          <Card key={analysis.id}>
                            <CardContent className="pt-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-sm">{analysis.title}</h4>
                                  {getStatusBadge(analysis.status)}
                                </div>
                                <code className="text-xs bg-muted px-2 py-1 rounded inline-block">
                                  {analysis.id.slice(0, 12)}...
                                </code>
                                <p className="text-sm line-clamp-2 text-muted-foreground">{analysis.text}</p>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Score: {analysis.score.overall_score}</span>
                                  <span>{new Date(analysis.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
