class AddStatusToMember < ActiveRecord::Migration[8.0]
  def change
    add_column :members, :status, :integer
  end
end
