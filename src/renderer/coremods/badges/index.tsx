import { filters, getByProps, waitForModule } from "../../modules/webpack";
import { Injector } from "../../modules/injector";
import React from "@common/react";
import type { User } from "discord-types/general";
import { APIBadges, Custom, badgeElements } from "./badge";
import { generalSettings } from "../settings/pages/General";
const injector = new Injector();

interface BadgeModArgs {
  guildId: string;
  user: User;
}

type BadgeMod = (args: BadgeModArgs) => {
  props: unknown;
  type: (props: unknown) => {
    props: {
      className: string;
      children: React.ReactElement[];
    };
  };
};

interface BadgeCache {
  badges: APIBadges;
  lastFetch: number;
}

// todo: guilds
const cache = new Map<string, BadgeCache>();
const REFRESH_INTERVAL = 1000 * 60 * 30;

export async function start(): Promise<void> {
  const mod = await waitForModule<Record<string, BadgeMod>>(
    filters.bySource(".GUILD_BOOSTER_LEVEL_1,"),
  );
  const fnPropName = Object.entries(mod).find(([_, v]) => typeof v === "function")?.[0];
  if (!fnPropName) {
    throw new Error("Could not find badges function");
  }

  const { containerWithContent } = getByProps<
    "containerWithContent",
    { containerWithContent: "string" }
  >("containerWithContent")!;

  injector.after(
    mod,
    fnPropName,
    (
      [
        {
          user: { id },
        },
      ],
      res,
    ) => {
      if (!generalSettings.get("badges")) return res;
      const memoRes = res.type(res.props);
      res.type = () => memoRes;

      const [badges, setBadges] = React.useState<APIBadges | undefined>();

      React.useEffect(() => {
        (async () => {
          if (!cache.has(id) || cache.get(id)!.lastFetch < Date.now() - REFRESH_INTERVAL) {
            cache.set(
              id,
              // TODO: new backend
              await fetch(`${generalSettings.get("apiUrl")}/api/v1/users/${id}`)
                .then(async (res) => {
                  const body = (await res.json()) as Record<string, unknown> & {
                    badges: APIBadges;
                  };

                  if (res.status === 200 || res.status === 404) {
                    return {
                      badges: body.badges || {},
                      lastFetch: Date.now(),
                    };
                  }

                  cache.delete(id);
                  return {
                    badges: {},
                    lastFetch: Date.now(),
                  };
                })
                .catch((e) => e),
            );
          }

          setBadges(cache.get(id)?.badges);
        })();
      }, []);

      if (!badges) {
        return res;
      }

      if (badges.custom?.name && badges.custom.icon) {
        memoRes.props.children.push(<Custom url={badges.custom.icon} name={badges.custom.name} />);
      }

      badgeElements.forEach(({ type, component }) => {
        const value = badges[type];
        if (value) {
          memoRes.props.children.push(
            React.createElement(component, {
              color: badges.custom?.color,
            }),
          );
        }
      });

      if (memoRes.props.children.length > 0) {
        if (!memoRes.props.className.includes(containerWithContent)) {
          memoRes.props.className += ` ${containerWithContent}`;
        }
        if (!memoRes.props.className.includes("replugged-badges-container")) {
          memoRes.props.className += " replugged-badges-container";
        }
      }

      return res;
    },
  );
}

export function stop(): void {
  injector.uninjectAll();
}
