json.extract! member, :id, :first_name, :last_name, :address_1, :address_2, :postal_code, :phone, :email, :created_at, :updated_at
json.url member_url(member, format: :json)
