/**
 * DREAMY VOYAGE // BLIND TEST PROTOCOL - CLOUDFLARE D1 WORKER BACKEND
 * Ultra-fast Edge API for Global Community Median Score Aggregation
 */

// Helper: Calculate exact mathematical median from a sorted array of numbers
function calculateMedian(sortedArray) {
    if (!sortedArray || sortedArray.length === 0) return 85;
    const mid = Math.floor(sortedArray.length / 2);
    if (sortedArray.length % 2 !== 0) {
        return sortedArray[mid];
    } else {
        return Math.round((sortedArray[mid - 1] + sortedArray[mid]) / 2.0);
    }
}

// Helper: Generate privacy-preserving SHA-256 client hash
async function hashClientIP(ip, userAgent) {
    if (!ip) return 'anon';
    const text = `${ip}::${userAgent || ''}::dreamy_salt_2026`;
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Helper: Standard CORS headers allowing dreamy.voyage and local testing
function getCorsHeaders(request) {
    const origin = request.headers.get('Origin') || '*';
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = getCorsHeaders(request);

        // Handle CORS Preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Check D1 Database Binding
            if (!env.DB) {
                return new Response(JSON.stringify({
                    status: 'error',
                    message: 'D1 database binding "DB" is not configured in wrangler.toml'
                }), { status: 500, headers: corsHeaders });
            }

            // 1. Health Check Endpoint
            if (path === '/' || path === '/api/health') {
                return new Response(JSON.stringify({
                    status: 'ok',
                    service: 'Dreamy Voyage Blind Test D1 Engine',
                    time: new Date().toISOString()
                }), { status: 200, headers: corsHeaders });
            }

            // 2. GET /api/stats - Retrieve all community medians and counts
            if (request.method === 'GET' && path === '/api/stats') {
                const trackIdParam = url.searchParams.get('trackId');

                if (trackIdParam) {
                    const trackId = parseInt(trackIdParam, 10);
                    if (isNaN(trackId)) {
                        return new Response(JSON.stringify({ status: 'error', message: 'Invalid trackId' }), {
                            status: 400, headers: corsHeaders
                        });
                    }

                    const rows = await env.DB.prepare(
                        'SELECT score FROM track_scores WHERE track_id = ? ORDER BY score ASC'
                    ).bind(trackId).all();

                    const scores = rows.results ? rows.results.map(r => r.score) : [];
                    const count = scores.length;
                    const median = calculateMedian(scores);

                    return new Response(JSON.stringify({
                        status: 'ok',
                        trackId,
                        count,
                        median
                    }), { status: 200, headers: corsHeaders });
                }

                // Query all scores grouped by track for full Prime 7 suite
                const allRows = await env.DB.prepare(
                    'SELECT track_id, score FROM track_scores ORDER BY track_id ASC, score ASC'
                ).all();

                const statsMap = {};
                const list = allRows.results || [];

                for (const row of list) {
                    const tid = row.track_id;
                    if (!statsMap[tid]) {
                        statsMap[tid] = [];
                    }
                    statsMap[tid].push(row.score);
                }

                const result = {};
                for (const tid in statsMap) {
                    const arr = statsMap[tid];
                    result[tid] = {
                        count: arr.length,
                        median: calculateMedian(arr)
                    };
                }

                return new Response(JSON.stringify({
                    status: 'ok',
                    updatedAt: new Date().toISOString(),
                    stats: result
                }), { status: 200, headers: corsHeaders });
            }

            // 3. POST /api/score - Record a new score and return updated stats
            if (request.method === 'POST' && path === '/api/score') {
                let body = {};
                try {
                    body = await request.json();
                } catch (e) {
                    return new Response(JSON.stringify({ status: 'error', message: 'Invalid JSON body' }), {
                        status: 400, headers: corsHeaders
                    });
                }

                const trackId = parseInt(body.track_id || body.trackId, 10);
                const score = parseInt(body.score, 10);
                const s1 = body.stage1 !== undefined && body.stage1 !== null ? parseInt(body.stage1, 10) : null;
                const s2 = body.stage2 !== undefined && body.stage2 !== null ? parseInt(body.stage2, 10) : null;
                const s3 = body.stage3 !== undefined && body.stage3 !== null ? parseInt(body.stage3, 10) : null;

                // Validate parameters
                if (isNaN(trackId) || trackId < 1 || trackId > 99) {
                    return new Response(JSON.stringify({ status: 'error', message: 'track_id must be between 1 and 99' }), {
                        status: 400, headers: corsHeaders
                    });
                }

                if (isNaN(score) || score < 0 || score > 100) {
                    return new Response(JSON.stringify({ status: 'error', message: 'score must be between 0 and 100' }), {
                        status: 400, headers: corsHeaders
                    });
                }

                // Privacy-friendly hashed client fingerprint
                const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
                const userAgent = request.headers.get('user-agent') || '';
                const clientHash = await hashClientIP(clientIP, userAgent);

                // Insert into Cloudflare D1
                await env.DB.prepare(
                    `INSERT INTO track_scores (track_id, score, stage1, stage2, stage3, client_hash)
                     VALUES (?, ?, ?, ?, ?, ?)`
                ).bind(trackId, score, s1, s2, s3, clientHash).run();

                // Immediately fetch updated score distribution to recalculate median
                const updatedRows = await env.DB.prepare(
                    'SELECT score FROM track_scores WHERE track_id = ? ORDER BY score ASC'
                ).bind(trackId).all();

                const updatedScores = updatedRows.results ? updatedRows.results.map(r => r.score) : [];
                const updatedCount = updatedScores.length;
                const updatedMedian = calculateMedian(updatedScores);

                return new Response(JSON.stringify({
                    status: 'ok',
                    trackId,
                    score,
                    count: updatedCount,
                    median: updatedMedian,
                    timestamp: new Date().toISOString()
                }), { status: 200, headers: corsHeaders });
            }

            // 404 Route
            return new Response(JSON.stringify({ status: 'error', message: 'Not found' }), {
                status: 404, headers: corsHeaders
            });

        } catch (err) {
            console.error('[Cloudflare D1 Worker Error]:', err);
            return new Response(JSON.stringify({
                status: 'error',
                message: err.message || 'Internal Server Error'
            }), { status: 500, headers: corsHeaders });
        }
    }
};
