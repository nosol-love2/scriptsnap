/**
 * 모드별 프롬프트 생성
 * 자막 텍스트를 받아서 Claude에게 가공 요청하는 프롬프트
 */

const MODE_PROMPTS = {
  full: {
    name: '전체 대본',
    needsAI: true,
    build(transcript) {
      return `아래는 유튜브 영상에서 추출한 자막 원문이야. 이걸 자연스러운 대본으로 정리해줘.

[자막 원문]
${transcript}

[규칙]
- 타임스탬프 없이 자연스러운 문장으로 정리
- 영어 자막이면 한국어로 번역해서 출력
- 불필요한 추임새(어, 음, 그...)는 제거
- 문단을 적절히 나눠서 가독성 높게
- 별도의 설명 없이 대본 내용만 출력`;
    },
  },

  summary: {
    name: '요약본',
    needsAI: true,
    build(transcript) {
      return `아래는 유튜브 영상에서 추출한 자막이야. 핵심 내용을 요약해줘.

[자막 원문]
${transcript}

[규칙]
- 핵심 내용을 3~5개 불릿 포인트로 압축 요약
- 영어 자막이면 한국어로 번역
- 각 불릿은 한 문장으로 간결하게
- 마지막에 한줄 종합 정리 추가
- 별도의 설명 없이 요약만 출력`;
    },
  },

  shorts: {
    name: '숏츠 대본화',
    needsAI: true,
    build(transcript) {
      return `아래는 유튜브 영상에서 추출한 자막이야. 60초 숏츠 대본으로 재구성해줘.

[자막 원문]
${transcript}

[규칙]
- 60초 분량의 숏츠 대본 구조로 재구성:

[후킹 (0~5초)] 시청자를 잡는 강렬한 오프닝
[전개 (5~45초)] 핵심 내용 전달 (2~3개 포인트)
[CTA (45~60초)] 구독/좋아요/댓글 유도

- 한국어로 출력
- 자연스럽게 말하듯이 작성
- 각 섹션 라벨 포함해서 출력`;
    },
  },

  hooks: {
    name: '후킹 문장 추출',
    needsAI: true,
    build(transcript) {
      return `아래는 유튜브 영상에서 추출한 자막이야. 후킹 문장을 추출해줘.

[자막 원문]
${transcript}

[규칙]
- 시청자를 멈추게 만드는 임팩트 있는 문장 5~10개 추출
- 번호를 매겨서 목록으로 출력
- 영어 원문이면 한국어로 번역
- 각 문장은 숏츠/릴스 오프닝으로 바로 쓸 수 있게 다듬기
- 과장이나 변형 없이 자막 내용 기반으로만 추출`;
    },
  },
};

/**
 * 자막 텍스트 + mode → 프롬프트 생성
 */
function buildPrompt(transcript, mode) {
  const modeConfig = MODE_PROMPTS[mode];
  if (!modeConfig) throw new Error(`알 수 없는 모드: ${mode}`);
  return modeConfig.build(transcript);
}

function needsAI(mode) {
  return MODE_PROMPTS[mode]?.needsAI ?? true;
}

module.exports = { buildPrompt, needsAI };
