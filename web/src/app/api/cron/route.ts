import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // We expect the GitHub PAT to be stored in the GITHUB_PAT environment variable
    const githubPat = process.env.GITHUB_PAT;
    
    if (!githubPat) {
      return NextResponse.json(
        { error: 'GITHUB_PAT environment variable is not set' },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://api.github.com/repos/AbhimanyuKandhal/Smart-City-Predictor/actions/workflows/ml-pipeline.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubPat}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Vercel-Cron-Trigger'
        },
        body: JSON.stringify({
          ref: 'main',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to trigger GitHub Action:', errorText);
      return NextResponse.json(
        { error: 'Failed to trigger GitHub Action', details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, message: 'GitHub Action triggered successfully' });
  } catch (error) {
    console.error('Error triggering GitHub Action:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
