-- Batch 8: a compact authenticated library catalog for lazy content delivery.
-- Bodies remain in chapters.pack and are fetched only when a feature needs them.

begin;

create or replace function public.published_chapter_catalog()
returns table (
  id text, revision text, subject text, title text, updated_at timestamptz,
  deck text, est_minutes integer, section_index jsonb, card_index jsonb,
  mcq_index jsonb, section_count integer, card_count integer, mcq_count integer,
  emq_count integer, mnemonic_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.revision,
    c.subject,
    c.title,
    c.updated_at,
    roots.root,
    case when (c.pack->>'estMinutes') ~ '^[0-9]+$' then (c.pack->>'estMinutes')::integer end,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', section.value->>'id', 'title', section.value->>'title') order by section.ordinality)
      from jsonb_array_elements(coalesce(c.pack->'sections', '[]'::jsonb)) with ordinality as section(value, ordinality)
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', card.value->>'id',
          'deck', case when leaves.leaf is null then roots.root else roots.root || '::' || leaves.leaf end
        ) order by card.ordinality
      )
      from jsonb_array_elements(coalesce(c.pack->'cards', '[]'::jsonb)) with ordinality as card(value, ordinality)
      left join lateral (
        select coalesce(
          nullif(btrim(card.value->>'deck'), ''),
          (
            select coalesce(nullif(btrim(section.value->>'deck'), ''), nullif(btrim(section.value->>'title'), ''))
            from jsonb_array_elements(coalesce(c.pack->'sections', '[]'::jsonb)) as section(value)
            where section.value->>'id' = coalesce(card.value->>'sectionId', card.value->>'tag')
            limit 1
          )
        ) as leaf
      ) as leaves on true
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', question.value->>'id', 'difficulty', question.value->'difficulty') order by question.ordinality)
      from jsonb_array_elements(coalesce(c.pack->'mcqs', '[]'::jsonb)) with ordinality as question(value, ordinality)
    ), '[]'::jsonb),
    jsonb_array_length(coalesce(c.pack->'sections', '[]'::jsonb)),
    jsonb_array_length(coalesce(c.pack->'cards', '[]'::jsonb)),
    jsonb_array_length(coalesce(c.pack->'mcqs', '[]'::jsonb)),
    jsonb_array_length(coalesce(c.pack->'emqs', '[]'::jsonb)),
    jsonb_array_length(coalesce(c.pack->'mnemonics', '[]'::jsonb))
  from public.chapters as c
  cross join lateral (
    select coalesce(
      nullif(btrim(c.pack->>'deck'), ''),
      btrim(coalesce(c.subject, '') || '::' || coalesce(c.title, ''))
    ) as root
  ) as roots
  where c.status = 'published'
    and public.is_allowed_learner()
  order by c.subject, c.title, c.id;
$$;

revoke all on function public.published_chapter_catalog() from public, anon;
grant execute on function public.published_chapter_catalog() to authenticated;

commit;
