    // functions/api/storage-usage.ts

    interface Env {
      BUCKET: R2Bucket;
    }

    // 这个函数会处理来自 /api/storage-usage 的请求
    export const onRequestGet: PagesFunction<Env> = async (context) => {
      try {
        const bucket = context.env.BUCKET;
        let totalSize = 0;
        let truncated = true;
        let cursor: string | undefined = undefined;

        // R2 list() 每次最多返回 1000 个对象，需要循环获取所有对象
        while (truncated) {
          const listResult = await bucket.list({
            limit: 1000,
            cursor: cursor,
          });

          for (const obj of listResult.objects) {
            totalSize += obj.size;
          }

          truncated = listResult.truncated;
          cursor = listResult.cursor;
        }

        // 返回一个 JSON 对象，包含总大小（字节）
        return new Response(JSON.stringify({ totalSize }), {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error('Failed to calculate storage usage:', error);
        return new Response(JSON.stringify({ error: 'Failed to retrieve storage usage.' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
    };
