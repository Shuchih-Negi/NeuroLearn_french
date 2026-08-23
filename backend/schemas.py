"""
backend/schemas.py — Pydantic request models for the French Edition API.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EyeMetricsPayload(BaseModel):
    blink_rate:        Optional[float] = None
    pupil_dilation:    Optional[float] = None
    fixation_duration: Optional[float] = None
    saccade_rate:      Optional[float] = None
    gaze_stability:    Optional[float] = None


class LangNextQuestionRequest(BaseModel):
    """Adaptive language question request: attention signals + learning context."""
    character:            str
    topic:                str = "French basics"
    target_language:      str = "fr"
    difficulty:           int = Field(1, ge=1, le=5)
    attention_state:      str = "Focused"
    attention_confidence: float = Field(0.5, ge=0.0, le=1.0)
    eye_metrics:          Optional[EyeMetricsPayload] = None
    recent_states:        List[str] = Field(default_factory=list)
    last_correct:         Optional[bool] = None
    last_rt:              Optional[float] = None
    session_accuracy:     float = Field(0.0, ge=0.0, le=1.0)
    previous_questions:   List[str] = Field(default_factory=list)
    question_number:      int = Field(1, ge=1)
    total_questions:      int = Field(10, ge=1)
    skill_focus:          str = "vocabulary_basic"
    exercise_type:        Optional[str] = None
    learner_age:          int = 12
    student_id:           str = "default"
    section_id:           str = "default_section"
    session_fatigue:      float = Field(0.0, ge=0.0, le=1.0)
    quest_step:           Optional[Dict[str, Any]] = None


class LangStoryRequest(BaseModel):
    character:        str
    topic:            str
    target_language:  str = "fr"
    difficulty:       int = Field(1, ge=1, le=5)
    learner_age:      int = 12


class LangFeedbackRequest(BaseModel):
    character:         str
    total_correct:     int
    total_questions:   int
    target_language:   str = "fr"
    topic:             str = "French basics"
    attention_history: List[str] = []
    skill_results:     Dict[str, float] = {}
    student_id:        str = "default"


class QuestGenerateRequest(BaseModel):
    character:       str
    topic:           str = "French basics"
    target_language: str = "fr"
    total_questions: int = Field(10, ge=1, le=30)
    learner_age:     int = 12


class LangValidateRequest(BaseModel):
    learner_answer:     str
    correct_answer:     str
    acceptable_answers: List[str] = []
    target_language:    str = "fr"


class LangProgressUpdate(BaseModel):
    """
    Posted after every answer. Feeds mastery tracking, SM-2 scheduling,
    and the interaction dataset.
    """
    student_id:           str = "default"
    section_id:           str = "default_section"
    skill_tag:            str
    correct:              bool
    response_time:        float = 0.0
    attention_state:      str = "Focused"
    attention_confidence: float = Field(0.5, ge=0.0, le=1.0)
    xp_earned:            int = 0
    exercise_type:        str = "multiple_choice_vocab"
    target_language:      str = "fr"
    # Dataset-enrichment fields (optional, backward compatible)
    hint_used:            bool = False
    error_type:           str = "none"
    learner_answer:       str = ""
    expected_answer:      str = ""
    question_text:        str = ""
    question_number:      int = Field(1, ge=1)
    total_questions:      int = Field(10, ge=1)
