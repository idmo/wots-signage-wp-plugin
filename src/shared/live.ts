/**
 * Where the follower counter gets fresh numbers. The kiosk player uses its
 * key; the admin's previews use the logged-in session. Each bundle sets
 * this once at startup.
 */
export type FollowerFetcher = () => Promise< { followers: number | null } >;

let fetcher: FollowerFetcher | null = null;

export function setFollowerFetcher( f: FollowerFetcher ): void {
	fetcher = f;
}

export function followerFetcher(): FollowerFetcher | null {
	return fetcher;
}
