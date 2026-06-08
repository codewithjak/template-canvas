/**
 * src/services/templatesRepo.ts
 * CRUD for templates persisted in Supabase, scoped to the user's team.
 *
 * Row Level Security does the tenant isolation: every query below is
 * automatically restricted to the caller's team(s), so a user can never
 * read or write another team's templates even if this code had a bug.
 */
import { supabase } from './supabaseClient'
import { getActiveTeamId } from './teamService'
import { logEvent } from './analytics'

export interface TemplateSummary {
  id: string
  name: string
  updated_at: string
}

export interface TemplateRecord extends TemplateSummary {
  body_json: unknown
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not authenticated.')
  return data.user.id
}

/** List the team's templates, most recently updated first. */
export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** Fetch a single template including its full body. */
export async function getTemplate(id: string): Promise<TemplateRecord> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, updated_at, body_json')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as TemplateRecord
}

/** Create a new template; returns its id. */
export async function createTemplate(name: string, body: unknown): Promise<string> {
  const [teamId, userId] = await Promise.all([getActiveTeamId(), currentUserId()])

  const { data, error } = await supabase
    .from('templates')
    .insert({
      team_id: teamId,
      name,
      body_json: body,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error

  void logEvent('template_created', { template_id: data.id, name })
  return data.id as string
}

/** Overwrite an existing template's name + body. */
export async function updateTemplate(
  id: string,
  name: string,
  body: unknown,
): Promise<void> {
  const userId = await currentUserId()

  const { error } = await supabase
    .from('templates')
    .update({
      name,
      body_json: body,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}
