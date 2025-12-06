json.extract! team_member, :id, :team_id, :member_id, :status, :created_at, :updated_at
json.url team_member_url(team_member, format: :json)
