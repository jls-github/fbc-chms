class AddBirthdateToMembers < ActiveRecord::Migration[8.0]
  def change
    add_column :members, :birthdate, :date
  end
end
