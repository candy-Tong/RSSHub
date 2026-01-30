import { load } from 'cheerio';
import type { Context } from 'hono';

import { config } from '@/config';
import type { Data, DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/blog',
    categories: ['programming'],
    example: '/claude/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['claude.com/blog'],
            target: '/blog',
        },
    ],
    name: 'Blog',
    maintainers: ['KarasuYuu'],
    handler,
};

async function handler(ctx: Context): Promise<Data> {
    const limit = Number.parseInt(ctx.req.query('limit') || '10');
    const baseUrl = 'https://claude.com';
    const blogUrl = `${baseUrl}/blog`;

    const response = await ofetch(blogUrl, {
        headers: {
            'User-Agent': config.ua,
        },
    });

    const $ = load(response);
    const list = $('.blog_cms_item.w-dyn-item')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            const $item = $(item);
            const title = $item.find('.card_blog_title.u-text-style-h6').text().trim();
            const link = new URL($item.find('.clickable_link.w-inline-block').attr('href') || '', baseUrl).href;
            const dateStr = $item.find('.u-text-style-caption.u-foreground-tertiary.u-mb-1-5').text().trim();

            return {
                title,
                link,
                pubDate: parseDate(dateStr),
            } as DataItem;
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link!, async () => {
                const detailResponse = await ofetch(item.link!, {
                    headers: {
                        'User-Agent': config.ua,
                    },
                });
                const $detail = load(detailResponse);

                // Main content
                const content = $detail('.u-rich-text-blog.u-margin-trim.w-richtext').html() || '';

                // Author (if available)
                const author = $detail('.hero_blog_post_details_item')
                    .filter((_, el) => $(el).find('.u-text-style-caption').text().includes('Author'))
                    .find('.u-text-style-body-3')
                    .text()
                    .trim();

                // Category
                const categories = $detail('.hero_blog_post_details_item')
                    .filter((_, el) => $(el).find('.u-text-style-caption').text().includes('Category'))
                    .find('.w-dyn-item')
                    .toArray()
                    .map((el) => $(el).text().trim());

                return {
                    ...item,
                    description: content,
                    author,
                    category: categories,
                } as DataItem;
            })
        )
    );

    return {
        title: 'Claude Blog',
        link: blogUrl,
        item: items as DataItem[],
    };
}
