import json

import paddle
import paddlenlp
from paddlenlp import Taskflow


cases = [
    (
        "uie_demo",
        ["时间", "选手", "赛事名称"],
        "2月8日上午北京冬奥会自由式滑雪女子大跳台决赛中中国选手谷爱凌以188.25分获得金牌！",
    ),
    (
        "simple_cn",
        ["人群", "成分", "菌株", "功效"],
        "适用人群为婴儿，核心成分为乳铁蛋白，功效是支持肠道健康。",
    ),
    (
        "doc_style",
        ["适用人群", "核心成分", "菌株", "功能功效"],
        "适用人群为婴儿，核心成分为乳铁蛋白，功能功效是支持肠道健康。",
    ),
]


def main():
    print(json.dumps({"versions": {"paddle": paddle.__version__, "paddlenlp": paddlenlp.__version__}}, ensure_ascii=False))

    ie = None
    for name, schema, text in cases:
        if ie is None:
            ie = Taskflow(
                "information_extraction",
                schema=schema,
                model="uie-base",
                task_path="C:/Users/soulzyn/.paddlenlp/uie-runtime-probe/uie-base",
            )
        else:
            ie.set_schema(schema)

        result = ie(text)
        print(json.dumps({"name": name, "schema": schema, "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
