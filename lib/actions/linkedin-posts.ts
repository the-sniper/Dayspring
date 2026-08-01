"use server";

import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";
import { createJobCore } from "@/lib/jobs/create";
import {
  getPostQueries,
  pullLinkedinPosts,
  setPostQueries,
  type PostPullResult,
} from "@/lib/linkedin/pull";
import { hasLinkedinPostsKey } from "@/lib/integrations/linkedin/posts";
import { keyMessages } from "@/lib/keys/messages";

export type PostPullActionResult =
  | { ok: true; result: PostPullResult }
  | { ok: false; error: string };

export async function pullLinkedinPostsAction(): Promise<PostPullActionResult> {
  if (!(await hasLinkedinPostsKey())) {
    return { ok: false, error: keyMessages.apify };
  }
  try {
    const result = await pullLinkedinPosts();
    revalidatePath("/feed/posts");
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "LinkedIn post pull failed.",
    };
  }
}

export async function setPostStatusAction(
  postId: string,
  to: "new" | "saved" | "done" | "ignored",
): Promise<{ ok: boolean; error?: string }> {
  const res = await convex().mutation(api.linkedinPosts.setStatus, {
    id: postId as never,
    to,
  });
  revalidatePath("/feed/posts");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function markPostsDoneAction(
  postIds: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return { ok: false, error: "Nothing to mark done." };
  }
  const { updated } = await convex().mutation(api.linkedinPosts.setStatusBatch, {
    ids: postIds as never,
    to: "done",
  });
  revalidatePath("/feed/posts");
  return { ok: true, updated };
}

export type PromoteResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

// Turn a post into a real pipeline row. The post's extracted company/title are
// only defaults — the caller passes overrides when the extractor came up empty
// (or got it wrong), since a job row with a junk title is worse than none.
export async function promotePostAction(
  postId: string,
  overrides?: { companyName?: string; title?: string },
): Promise<PromoteResult> {
  const post = await convex().query(api.linkedinPosts.getById, {
    id: postId as never,
  });
  if (!post) return { ok: false, error: "Post not found." };
  if (post.jobId) return { ok: false, error: "Already in your pipeline." };

  const companyName = (overrides?.companyName ?? post.companyName ?? "").trim();
  const title = (overrides?.title ?? post.roleTitles[0] ?? "").trim();
  if (!companyName || !title) {
    return {
      ok: false,
      error: "Add a company and title — the post didn't name them clearly.",
    };
  }

  const res = await createJobCore({
    companyName,
    title,
    // The apply link when the post had one, else the post itself: either way
    // the row points at something a human can act on.
    url: post.jobUrl ?? post.postUrl,
    location: post.location,
    // The post body is the only "JD" available. Attributed so a later reader
    // knows this came from a post, not a job board.
    description: `From a LinkedIn post by ${post.authorName}${
      post.authorHeadline ? ` (${post.authorHeadline})` : ""
    }:\n\n${post.text}\n\nPost: ${post.postUrl}`,
    source: "linkedin_post",
    status: "wishlist",
    postedAt: post.postedAt,
  });
  if (!res.inserted) {
    return { ok: false, error: "Duplicate: that job is already tracked." };
  }

  await convex().mutation(api.linkedinPosts.markPromoted, {
    id: postId as never,
    jobId: res.jobId as never,
  });
  revalidatePath("/feed/posts");
  revalidatePath("/", "layout");
  return { ok: true, jobId: res.jobId };
}

export async function savePostQueriesAction(
  raw: string,
): Promise<{ ok: true; queries: string[] } | { ok: false; error: string }> {
  const queries = await setPostQueries(raw);
  revalidatePath("/feed/posts");
  return { ok: true, queries };
}

export async function getPostQueriesAction(): Promise<string[]> {
  return await getPostQueries();
}
