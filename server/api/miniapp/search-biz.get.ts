/**
 * 搜索公众号接口
 */
import { searchBiz } from '~/server/services/task-processor';

interface SearchBizQuery {
  keyword: string;
}

export default defineEventHandler(async event => {
  const query = getQuery<SearchBizQuery>(event);

  if (!query.keyword) {
    return {
      base_resp: {
        ret: -1,
        err_msg: 'keyword不能为空',
      },
    };
  }

  return searchBiz(query.keyword, event);
});