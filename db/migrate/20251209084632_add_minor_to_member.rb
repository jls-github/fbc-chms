class AddMinorToMember < ActiveRecord::Migration[8.0]
  def change
    add_column :members, :child_or_teen, :boolean
  end
end
